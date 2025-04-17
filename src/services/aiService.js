const OpenAI = require('openai');
const Recommendation = require('../models/Recommendation');

// Initialize OpenAI with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// In-memory cache for even faster access
// This complements the database cache
const memoryCache = {
  orderRecommendations: new Map(), // Map of orderId -> {recommendations, timestamp}
  userOverallRecommendations: new Map(), // Map of userId -> {recommendations, timestamp, orderCount}
  
  // Cache lifetime in milliseconds (15 minutes for memory cache)
  CACHE_TTL: 15 * 60 * 1000,
  
  // Store order recommendations in cache
  storeOrderRecommendation(orderId, recommendations) {
    this.orderRecommendations.set(orderId, {
      recommendations,
      timestamp: Date.now()
    });
  },
  
  // Get cached order recommendations if valid
  getOrderRecommendation(orderId) {
    const cached = this.orderRecommendations.get(orderId);
    if (!cached) return null;
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.orderRecommendations.delete(orderId);
      return null;
    }
    
    return cached.recommendations;
  },
  
  // Store overall recommendations for a user
  storeOverallRecommendation(userId, recommendations, orderCount) {
    this.userOverallRecommendations.set(userId, {
      recommendations,
      timestamp: Date.now(),
      orderCount
    });
  },
  
  // Get cached overall recommendations if valid
  getOverallRecommendation(userId, currentOrderCount) {
    const cached = this.userOverallRecommendations.get(userId);
    if (!cached) return null;
    
    // Invalidate cache if it's too old or if order count has changed
    if (Date.now() - cached.timestamp > this.CACHE_TTL || 
        cached.orderCount !== currentOrderCount) {
      this.userOverallRecommendations.delete(userId);
      return null;
    }
    
    return cached.recommendations;
  },
  
  // Clean expired cache entries (can be called periodically)
  cleanExpiredEntries() {
    const now = Date.now();
    
    for (const [orderId, entry] of this.orderRecommendations.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.orderRecommendations.delete(orderId);
      }
    }
    
    for (const [userId, entry] of this.userOverallRecommendations.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.userOverallRecommendations.delete(userId);
      }
    }
  }
};

// Clean memory cache every 15 minutes
setInterval(() => memoryCache.cleanExpiredEntries(), 15 * 60 * 1000);

class AIService {
  /**
   * Get AI-powered recommendations for a specific order
   * @param {Object} order - The order object
   * @returns {Promise<Object>} - Recommendations for the order
   */
  static async getOrderRecommendations(order) {
    try {
      const orderId = order._id.toString();
      const userId = order.user.toString();
      
      // Check memory cache first (fastest)
      const cachedInMemory = memoryCache.getOrderRecommendation(orderId);
      if (cachedInMemory) {
        console.log(`Using in-memory cached recommendations for order ${orderId}`);
        return cachedInMemory;
      }
      
      // Check database cache (slower but persistent)
      const cachedInDB = await Recommendation.findOne({
        recommendationId: orderId,
        type: 'order',
        user: userId
      });
      
      if (cachedInDB) {
        console.log(`Using database cached recommendations for order ${orderId}`);
        // Update memory cache for future requests
        memoryCache.storeOrderRecommendation(orderId, cachedInDB.data);
        return cachedInDB.data;
      }
      
      // Cache miss - get fresh recommendations
      console.log(`Fetching new AI recommendations for order ${orderId}`);
      
      // Prepare order data for the AI
      const orderData = this.prepareOrderDataForAI(order);
      
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a helpful AI assistant that specializes in analyzing carbon footprints of food delivery orders. 
                     Your job is to provide personalized recommendations to help users reduce their carbon footprint.
                     You should be factual, helpful, and concise. Format your response as JSON.`
          },
          {
            role: "user",
            content: `Analyze this food delivery order and suggest ways to reduce its carbon footprint.
                     Please provide specific recommendations for each food item based on its carbon impact,
                     and an overall recommendation. Return your response as a JSON object with the structure:
                     {
                       "overall": {
                         "message": "A concise summary message",
                         "tips": ["tip1", "tip2", ...]
                       },
                       "items": [
                         {
                           "itemName": "name of food item",
                           "emissionImpact": "high", "medium", or "low",
                           "alternatives": ["alternative1", "alternative2", ...],
                           "tips": ["tip1", "tip2", ...]
                         }
                       ]
                     }
                     
                     Here's the order data: ${JSON.stringify(orderData)}`
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });
      
      // Parse the response
      const recommendations = JSON.parse(response.choices[0].message.content);
      
      // Store in both caches
      memoryCache.storeOrderRecommendation(orderId, recommendations);
      
      await Recommendation.findOneAndUpdate(
        { recommendationId: orderId },
        {
          recommendationId: orderId,
          type: 'order',
          user: userId,
          order: orderId,
          data: recommendations
        },
        { upsert: true, new: true }
      );
      
      return recommendations;
    } catch (error) {
      console.error('Error getting AI recommendations for order:', error);
      // Return fallback recommendations
      return this.getFallbackRecommendations(order);
    }
  }
  
  /**
   * Get AI-powered overall recommendations based on user's order history
   * @param {string} userId - User ID
   * @param {Array} orders - Array of user orders
   * @returns {Promise<Object>} - Overall recommendations
   */
  static async getOverallRecommendations(userId, orders) {
    try {
      // Create a unique ID for overall recommendations
      const recommendationId = `overall_${userId}`;
      
      // Check memory cache first (fastest)
      const cachedInMemory = memoryCache.getOverallRecommendation(userId, orders.length);
      if (cachedInMemory) {
        console.log(`Using in-memory cached overall recommendations for user ${userId}`);
        return cachedInMemory;
      }
      
      // Check database cache (slower but persistent)
      const cachedInDB = await Recommendation.findOne({
        recommendationId,
        type: 'overall',
        user: userId,
        orderCount: orders.length
      });
      
      if (cachedInDB) {
        console.log(`Using database cached overall recommendations for user ${userId}`);
        // Update memory cache for future requests
        memoryCache.storeOverallRecommendation(userId, cachedInDB.data, orders.length);
        return cachedInDB.data;
      }
      
      // Cache miss - get fresh recommendations
      console.log(`Fetching new AI overall recommendations for user ${userId}`);
      
      // Prepare a summary of the user's ordering patterns
      const ordersSummary = this.prepareOrdersSummaryForAI(orders);
      
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a helpful AI assistant that specializes in analyzing patterns in food delivery orders 
                      and their carbon footprint impact. Your job is to provide actionable recommendations to help 
                      users reduce their carbon footprint based on their ordering history. Be factual, helpful, and concise.
                      Format your response as JSON.`
          },
          {
            role: "user",
            content: `Analyze this user's food delivery order history and suggest ways they can reduce their carbon footprint.
                      Focus on identifying patterns and providing personalized recommendations.
                      Return your response as a JSON object with the structure:
                      {
                        "message": "A personalized summary message based on their patterns",
                        "tips": ["specific tip 1", "specific tip 2", ...]
                      }
                      
                      Here's the order history summary: ${JSON.stringify(ordersSummary)}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: "json_object" }
      });
      
      // Parse the response
      const recommendations = JSON.parse(response.choices[0].message.content);
      
      // Store in both caches
      memoryCache.storeOverallRecommendation(userId, recommendations, orders.length);
      
      await Recommendation.findOneAndUpdate(
        { recommendationId },
        {
          recommendationId,
          type: 'overall',
          user: userId,
          orderCount: orders.length,
          data: recommendations
        },
        { upsert: true, new: true }
      );
      
      return recommendations;
    } catch (error) {
      console.error('Error getting AI overall recommendations:', error);
      // Return fallback recommendations
      return this.getFallbackOverallRecommendations();
    }
  }
  
  /**
   * Prepare order data in a format suitable for AI analysis
   * @param {Object} order - The order object
   * @returns {Object} - Formatted order data
   */
  static prepareOrderDataForAI(order) {
    return {
      restaurantName: order.restaurantName,
      platform: order.platform,
      orderDate: order.orderDate,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        category: item.category || 'unknown'
      })),
      emissions: {
        total: order.emissionData?.totalEmission || 0,
        food: order.emissionData?.foodEmission || 0,
        transport: order.emissionData?.transportEmission || 0,
        packaging: order.emissionData?.packagingEmission || 0
      },
      distance: order.emissionData?.factors?.distance || 0
    };
  }
  
  /**
   * Prepare orders summary for AI analysis
   * @param {Array} orders - Array of user orders
   * @returns {Object} - Formatted orders summary
   */
  static prepareOrdersSummaryForAI(orders) {
    // Calculate percentage of vegetarian orders
    const vegOrderCount = orders.filter(order => 
      order.items && order.items.every(item => item.category === 'veg')
    ).length;
    
    const vegPercentage = orders.length > 0 ? (vegOrderCount / orders.length) * 100 : 0;
    
    // Calculate average distance
    const avgDistance = orders.length > 0 ? 
      orders.reduce((sum, order) => sum + (order.emissionData?.factors?.distance || 0), 0) / orders.length : 0;
    
    // Calculate average items per order
    const avgItems = orders.length > 0 ?
      orders.reduce((sum, order) => sum + (order.items?.length || 0), 0) / orders.length : 0;
    
    // Get most ordered food types
    const foodTypes = {};
    orders.forEach(order => {
      order.items?.forEach(item => {
        const category = item.category || 'unknown';
        foodTypes[category] = (foodTypes[category] || 0) + 1;
      });
    });
    
    // Calculate platform usage
    const platforms = {};
    orders.forEach(order => {
      platforms[order.platform] = (platforms[order.platform] || 0) + 1;
    });
    
    return {
      totalOrders: orders.length,
      vegetarianPercentage: vegPercentage,
      averageDistance: avgDistance,
      averageItemsPerOrder: avgItems,
      foodTypes,
      platforms,
      timespan: {
        oldest: orders.length > 0 ? new Date(Math.min(...orders.map(o => new Date(o.orderDate)))).toISOString() : null,
        newest: orders.length > 0 ? new Date(Math.max(...orders.map(o => new Date(o.orderDate)))).toISOString() : null,
      }
    };
  }
  
  /**
   * Get fallback recommendations if AI call fails
   * @param {Object} order - The order object
   * @returns {Object} - Fallback recommendations
   */
  static getFallbackRecommendations(order) {
    const recommendations = {
      overall: {
        message: "Here are some ways to reduce the carbon footprint of your order:",
        tips: [
          "Consider ordering from restaurants closer to your location to reduce delivery emissions",
          "Order fewer items at once to reduce packaging waste",
          "Choose vegetarian options when possible"
        ]
      },
      items: []
    };
    
    // Generate basic recommendations for each item
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        const itemRec = {
          itemName: item.name,
          emissionImpact: item.category === 'non-veg' ? 'high' : item.category === 'veg' ? 'low' : 'medium',
          alternatives: [],
          tips: []
        };
        
        if (item.category === 'non-veg') {
          itemRec.alternatives = ['Plant-based alternative', 'Vegetarian option'];
          itemRec.tips = ['Non-vegetarian items typically have a higher carbon footprint'];
        } else if (item.category === 'veg') {
          itemRec.tips = ['Great choice! Vegetarian items have a lower carbon footprint'];
        }
        
        recommendations.items.push(itemRec);
      });
    }
    
    return recommendations;
  }
  
  /**
   * Get fallback overall recommendations if AI call fails
   * @returns {Object} - Fallback overall recommendations
   */
  static getFallbackOverallRecommendations() {
    return {
      message: "Based on your ordering habits, here are some general recommendations to reduce your carbon footprint:",
      tips: [
        "Try to order more vegetarian meals, which have a lower carbon footprint",
        "Order from restaurants closer to your location to reduce transportation emissions",
        "Combine your orders to reduce the number of deliveries and packaging",
        "Choose eco-friendly restaurants that use sustainable packaging"
      ]
    };
  }
}

module.exports = AIService; 