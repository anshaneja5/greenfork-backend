const express = require('express');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const AIService = require('../services/aiService');

const router = express.Router();

// Get total carbon footprint and breakdown
router.get('/summary', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });
    
    const summary = {
      totalEmission: 0,
      transportEmission: 0,
      packagingEmission: 0,
      foodEmission: 0,
      orderCount: orders.length,
      averageEmissionPerOrder: 0
    };

    orders.forEach(order => {
      if (order.emissionData) {
        summary.totalEmission += order.emissionData.totalEmission || 0;
        summary.transportEmission += order.emissionData.transportEmission || 0;
        summary.packagingEmission += order.emissionData.packagingEmission || 0;
        summary.foodEmission += order.emissionData.foodEmission || 0;
      }
    });

    if (orders.length > 0) {
      summary.averageEmissionPerOrder = summary.totalEmission / orders.length;
    }

    // Calculate percentages
    if (summary.totalEmission > 0) {
      summary.transportPercentage = (summary.transportEmission / summary.totalEmission) * 100;
      summary.packagingPercentage = (summary.packagingEmission / summary.totalEmission) * 100;
      summary.foodPercentage = (summary.foodEmission / summary.totalEmission) * 100;
    } else {
      summary.transportPercentage = 0;
      summary.packagingPercentage = 0;
      summary.foodPercentage = 0;
    }

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get emission trends over time
router.get('/trends', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ orderDate: 1 });

    const trends = orders.map(order => ({
      date: order.orderDate,
      totalEmission: order.emissionData?.totalEmission || 0,
      transportEmission: order.emissionData?.transportEmission || 0,
      packagingEmission: order.emissionData?.packagingEmission || 0,
      foodEmission: order.emissionData?.foodEmission || 0
    }));

    res.json(trends);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get platform comparison
router.get('/platform-comparison', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });
    
    const platformStats = {};
    
    orders.forEach(order => {
      if (!platformStats[order.platform]) {
        platformStats[order.platform] = {
          totalEmission: 0,
          orderCount: 0,
          averageEmission: 0
        };
      }
      
      if (order.emissionData) {
        platformStats[order.platform].totalEmission += order.emissionData.totalEmission || 0;
      }
      platformStats[order.platform].orderCount += 1;
    });

    // Calculate averages
    Object.keys(platformStats).forEach(platform => {
      platformStats[platform].averageEmission = 
        platformStats[platform].totalEmission / platformStats[platform].orderCount;
    });

    res.json(platformStats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get suggestions for reducing carbon footprint
router.get('/suggestions', auth, async (req, res) => {
  try {
    console.log('Fetching orders for user:', req.user._id);
    const orders = await Order.find({ user: req.user._id });
    console.log(`Found ${orders.length} orders for user`);
    
    if (!orders || orders.length === 0) {
      console.log('No orders found, returning general suggestion');
      return res.json([{
        type: 'general',
        message: 'Start tracking your food delivery orders to receive personalized suggestions for reducing your carbon footprint.',
        potentialSavings: 'Varies based on your ordering habits'
      }]);
    }
    
    const suggestions = [];
    
    // Analyze food choices
    console.log('Analyzing food choices...');
    const vegOrders = orders.filter(order => {
      if (!order.items || !Array.isArray(order.items)) {
        console.log('Invalid items data for order:', order._id);
        return false;
      }
      return order.items.every(item => 
        item && item.name && (
          item.name.toLowerCase().includes('veg') || 
          item.name.toLowerCase().includes('rice') || 
          item.name.toLowerCase().includes('dal')
        )
      );
    });
    
    const vegPercentage = (vegOrders.length / orders.length) * 100;
    console.log(`Vegetarian order percentage: ${vegPercentage}%`);
    if (vegPercentage < 50) {
      suggestions.push({
        type: 'food',
        message: 'Consider ordering more vegetarian meals to reduce your carbon footprint',
        potentialSavings: 'Up to 2.5 kg CO2 per meal'
      });
    }

    // Analyze distance
    console.log('Analyzing order distances...');
    const longDistanceOrders = orders.filter(order => {
      if (!order.emissionData || typeof order.emissionData.factors?.distance !== 'number') {
        console.log('Invalid distance data for order:', order._id);
        return false;
      }
      return order.emissionData.factors.distance > 2;
    });
    console.log(`Long distance orders: ${longDistanceOrders.length} out of ${orders.length}`);
    if (longDistanceOrders.length > orders.length / 2) {
      suggestions.push({
        type: 'distance',
        message: 'Try to order from restaurants within 2km to reduce transport emissions',
        potentialSavings: 'Up to 0.13 kg CO2 per order'
      });
    }

    // Analyze packaging
    console.log('Analyzing order sizes...');
    const largeOrders = orders.filter(order => {
      if (!order.items || !Array.isArray(order.items)) {
        console.log('Invalid items data for order:', order._id);
        return false;
      }
      return order.items.length > 4;
    });
    console.log(`Large orders: ${largeOrders.length} out of ${orders.length}`);
    if (largeOrders.length > orders.length / 2) {
      suggestions.push({
        type: 'packaging',
        message: 'Consider ordering fewer items per order to reduce packaging waste',
        potentialSavings: 'Up to 0.2 kg CO2 per order'
      });
    }

    // If no specific suggestions were generated, provide a general one
    if (suggestions.length === 0) {
      console.log('No specific suggestions generated, providing general suggestion');
      suggestions.push({
        type: 'general',
        message: 'Great job! Your ordering habits are already environmentally conscious. Keep up the good work!',
        potentialSavings: 'Maintaining current sustainable practices'
      });
    }

    console.log(`Generated ${suggestions.length} suggestions for user`);
    res.json(suggestions);
  } catch (error) {
    console.error('Error in /suggestions endpoint:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Error generating suggestions. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// AI-powered personalized recommendations for orders
router.get('/ai-recommendations', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ orderDate: -1 });
    
    if (!orders || orders.length === 0) {
      return res.json({
        overall: {
          message: "Start tracking your food delivery orders to receive personalized AI recommendations.",
          tips: []
        },
        items: []
      });
    }
    
    // Get AI recommendations based on all orders - pass the user ID for caching
    const overallRecommendations = await AIService.getOverallRecommendations(req.user._id.toString(), orders);
    
    // Get the most recent order
    const recentOrder = orders[0];
    
    // Get recommendations specific to the recent order
    const orderRecommendations = await AIService.getOrderRecommendations(recentOrder);
    
    res.json({
      overall: overallRecommendations,
      recentOrder: {
        id: recentOrder._id,
        restaurantName: recentOrder.restaurantName,
        date: recentOrder.orderDate,
        items: recentOrder.items
      },
      recentOrderRecommendations: orderRecommendations
    });
  } catch (error) {
    console.error('Error generating AI recommendations:', error);
    res.status(500).json({ 
      message: 'Error generating AI recommendations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 