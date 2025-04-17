const express = require('express');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const axios = require('axios');
const { extractZomatoOrders, extractSwiggyOrders } = require('../extractors');
const { calculateFoodEmission, getTravelDistanceKm, cleanAddress } = require('../services/totalEmissions.js');
const AIService = require('../services/aiService');

const router = express.Router();

// Calculate emissions based on food items
const calculateLocalFoodEmission = (foodItems) => {
  let totalEmission = 0;
  
  foodItems.forEach(item => {
    const itemName = item.name.toLowerCase();
    let emission = 0.5; // default fallback

    if (itemName.includes('beef')) emission = 4.0;
    else if (itemName.includes('chicken')) emission = 1.5;
    else if (itemName.includes('paneer')) emission = 1.2;
    else if (itemName.includes('cheese') || itemName.includes('cream')) emission = 2.5;
    else if (itemName.includes('veg') || itemName.includes('rice') || itemName.includes('dal')) emission = 0.7;

    totalEmission += emission * item.quantity;
  });

  return totalEmission;
};

// Calculate packaging emission
const calculatePackagingEmission = (itemCount) => {
  if (itemCount <= 2) return 0.1;
  if (itemCount <= 4) return 0.2;
  return 0.3;
};

// Calculate transport emission
const calculateTransportEmission = (distance) => {
  return (distance * 105) / 1000; // Convert g/km to kg CO2
};

// SPECIFIC ROUTES MUST COME BEFORE GENERIC ROUTES

/**
 * @route   GET /api/orders/zomato
 * @desc    Check Zomato login status and provide instructions
 * @access  Private
 */
router.get('/zomato', auth, async (req, res) => {
  try {
    console.log('Zomato route accessed by user:', req.user._id);
    
    // Provide instructions for browser-based approach
    res.json({
      success: true,
      message: 'To import your Zomato orders, please follow these steps:',
      instructions: [
        '1. Open a new browser tab and go to https://www.zomato.com/webroutes/user/orders',
        '2. Make sure you are logged in to Zomato in that tab',
        '3. Copy the entire JSON response from that page',
        '4. Return to this app and paste the JSON in the text area below',
        '5. Click "Import Orders" to process your data'
      ],
      requiresManualInput: true
    });
  } catch (error) {
    console.error('Error in Zomato route:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking Zomato login status',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/orders/zomato/fetch
 * @desc    Process manually provided Zomato orders data
 * @access  Private
 */
router.post('/zomato/fetch', auth, async (req, res) => {
  try {
    const { ordersData } = req.body;
    
    console.log('[DEBUG] Received Zomato orders data:', 
      Array.isArray(ordersData) ? `${ordersData.length} orders` : 'Not an array');
    
    if (!ordersData) {
      console.log('[DEBUG] No orders data provided');
      return res.status(400).json({ 
        success: false, 
        message: 'No orders data provided' 
      });
    }
    
    // Handle both array and object formats
    let ordersArray;
    if (Array.isArray(ordersData)) {
      ordersArray = ordersData;
      console.log('[DEBUG] Using orders data as array');
    } else if (ordersData.entities && ordersData.entities.ORDER) {
      // Extract orders from the entities.ORDER object
      ordersArray = Object.values(ordersData.entities.ORDER);
      console.log('[DEBUG] Extracted orders from entities.ORDER');
    } else {
      console.log('[DEBUG] Invalid data format');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid data format. Expected an array of orders or an object with entities.ORDER' 
      });
    }
    
    if (ordersArray.length === 0) {
      console.log('[DEBUG] No orders found in the provided data');
      return res.status(400).json({ 
        success: false, 
        message: 'No orders found in the provided data' 
      });
    }

    console.log(`[DEBUG] Processing ${ordersArray.length} orders`);
    const processedOrders = [];
    const errors = [];
    
    for (const orderData of ordersArray) {
      try {
        // Validate required fields
        if (!orderData.orderId || !orderData.resInfo || !orderData.deliveryDetails) {
          console.log(`[DEBUG] Order ${orderData.orderId || 'unknown'} missing required fields`);
          errors.push(`Order ${orderData.orderId || 'unknown'} missing required fields`);
          continue;
        }
        
        // Parse the order date
        let orderDate;
        try {
          // Handle different date formats
          if (orderData.orderDate.includes(' at ')) {
            // Format: "January 29, 2025 at 09:09 PM"
            const [datePart, timePart] = orderData.orderDate.split(' at ');
            const [month, day, year] = datePart.split(' ');
            const [time, period] = timePart.split(' ');
            const [hours, minutes] = time.split(':');
            
            orderDate = new Date(year, getMonthNumber(month), day);
            let hour = parseInt(hours);
            if (period === 'PM' && hour !== 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;
            
            orderDate.setHours(hour, parseInt(minutes));
          } else if (orderData.orderDate.includes('T')) {
            // Format: "2025-01-29T15:39:00.000Z"
            orderDate = new Date(orderData.orderDate);
          } else {
            // Try parsing as a standard date string
            orderDate = new Date(orderData.orderDate);
          }

          // Validate the date
          if (isNaN(orderDate.getTime())) {
            console.error('Invalid date format:', orderData.orderDate);
            orderDate = new Date(); // Fallback to current date
          }
        } catch (error) {
          console.error('Error parsing date:', error);
          orderDate = new Date(); // Fallback to current date
        }

        // Extract numeric values
        const orderAmount = parseFloat(orderData.totalCost.replace('₹', '').trim());
        
        // Process items from dishString
        const items = [];
        if (orderData.dishString) {
          const dishItems = orderData.dishString.split(', ');
          for (const item of dishItems) {
            const [quantity, ...nameParts] = item.split(' x ');
            const name = nameParts.join(' x ');
            items.push({
              name,
              quantity: parseInt(quantity),
              price: null // Price per item not available in the data
            });
          }
        }

        // Calculate emissions
        let emissionData = {
          transportEmission: 0,
          packagingEmission: 0,
          foodEmission: 0,
          totalEmission: 0
        };

        try {
          // Get delivery address
          const deliveryAddress = orderData.deliveryDetails.deliveryAddress || '';
          console.log(`[DEBUG] Delivery address: ${deliveryAddress}`);
          
          // Get restaurant coordinates from directionUrl
          let restaurantCoords = null;
          if (orderData.resInfo && orderData.resInfo.locality && orderData.resInfo.locality.directionUrl) {
            const directionUrl = orderData.resInfo.locality.directionUrl;
            // Extract coordinates from URL like "https://www.google.com/maps/dir/?api=1&destination=28.6343552938,77.0687179640"
            const match = directionUrl.match(/destination=([\d.-]+),([\d.-]+)/);
            if (match) {
              restaurantCoords = {
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2])
              };
              console.log(`[DEBUG] Extracted coordinates from directionUrl: ${restaurantCoords.lat}, ${restaurantCoords.lng}`);
            }
          }
          
          // Calculate travel distance if we have coordinates
          let travelDistance = 0;
          if (restaurantCoords && deliveryAddress) {
            travelDistance = await getTravelDistanceKm(deliveryAddress, restaurantCoords);
            console.log(`[DEBUG] Calculated travel distance: ${travelDistance} km`);
          }
          
          // Format dishString for emission calculation
          let formattedDishString = '';
          if (orderData.dishString) {
            // The dishString is already in the correct format like "2 x Paneer Tikka, 3 x Chole Kulche"
            formattedDishString = orderData.dishString;
            console.log(`[DEBUG] Using dishString for emission calculation: ${formattedDishString}`);
          }
          
          // Calculate emissions if we have dishString
          if (formattedDishString) {
            console.log('[DEBUG] Calling calculateFoodEmission function');
            const emissions = await calculateFoodEmission(formattedDishString, travelDistance);
            console.log(`[DEBUG] Received emissions from calculateFoodEmission: ${JSON.stringify(emissions)}`);
            
            emissionData = {
              transportEmission: parseFloat(emissions.travel),
              packagingEmission: parseFloat(emissions.packaging),
              foodEmission: parseFloat(emissions.food),
              totalEmission: parseFloat(emissions.total)
            };
            console.log(`[DEBUG] Parsed emission data: ${JSON.stringify(emissionData)}`);
          } else {
            console.log('[DEBUG] No dishString available, using default emission values');
          }
        } catch (error) {
          console.error('[DEBUG] Error calculating emissions:', error);
          // Continue with default emission values
        }

        // Create the order object with all available data
        const order = new Order({
          user: req.user._id,
          platform: 'Zomato',
          orderId: orderData.orderId.toString(),
          restaurantName: orderData.resInfo.name,
          orderDate,
          orderAmount,
          orderStatus: orderData.deliveryDetails.deliveryLabel || 'Unknown',
          items,
          emissionData,
          deliveryAddress: orderData.deliveryDetails.deliveryAddress,
          restaurantRating: {
            aggregateRating: orderData.resInfo.rating?.aggregate_rating,
            ratingText: orderData.resInfo.rating?.rating_text,
            ratingColor: orderData.resInfo.rating?.rating_color,
            votes: orderData.resInfo.rating?.votes,
            subtext: orderData.resInfo.rating?.subtext
          },
          restaurantImage: orderData.resInfo.thumb,
          restaurantUrl: orderData.resInfo.resUrl,
          restaurantPhone: orderData.resInfo.phone?.phone_string,
          restaurantEstablishment: orderData.resInfo.establishment,
          locality: orderData.resInfo.locality ? {
            cityId: orderData.resInfo.locality.cityId,
            localityName: orderData.resInfo.locality.localityName,
            localityUrl: orderData.resInfo.locality.localityUrl,
            addressString: orderData.resInfo.locality.addressString,
            directionTitle: orderData.resInfo.locality.directionTitle,
            directionUrl: orderData.resInfo.locality.directionUrl
          } : null,
          deliveryDetails: {
            deliveryStatus: orderData.deliveryDetails.deliveryStatus,
            deliveryMessage: orderData.deliveryDetails.deliveryMessage,
            deliveryLabel: orderData.deliveryDetails.deliveryLabel
          },
          paymentStatus: orderData.paymentStatus,
          dishString: orderData.dishString,
          hashId: orderData.hashId,
          reOrderUrl: orderData.reOrderUrl
        });

        // Save the order
        console.log(`[DEBUG] Saving order with emission data: ${JSON.stringify(emissionData)}`);
        await order.save();
        console.log(`[DEBUG] Order saved successfully: ${order._id}`);
        processedOrders.push(order);
      } catch (error) {
        console.error('[DEBUG] Error processing order:', error);
        errors.push(`Error processing order: ${error.message}`);
        // Continue with next order even if one fails
      }
    }

    console.log(`[DEBUG] Successfully processed ${processedOrders.length} orders${errors.length > 0 ? ` (${errors.length} errors)` : ''}`);
    res.json({ 
      success: true,
      message: `Successfully processed ${processedOrders.length} orders${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
      orders: processedOrders,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('[DEBUG] Error in Zomato order processing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing Zomato orders',
      error: error.message
    });
  }
});

// Helper function to convert month name to number
function getMonthNumber(monthName) {
  const months = {
    'January': 0, 'February': 1, 'March': 2, 'April': 3,
    'May': 4, 'June': 5, 'July': 6, 'August': 7,
    'September': 8, 'October': 9, 'November': 10, 'December': 11
  };
  return months[monthName];
}

/**
 * @route   GET /api/orders/platform/:platform
 * @desc    Get orders by platform
 * @access  Private
 */
router.get('/platform/:platform', auth, async (req, res) => {
  try {
    const { platform } = req.params;
    const orders = await Order.find({ 
      user: req.user._id,
      platform 
    }).sort({ orderDate: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    console.error(`Error fetching ${req.params.platform} orders:`, error);
    res.status(500).json({ success: false, message: `Error fetching ${req.params.platform} orders` });
  }
});

/**
 * @route   GET /api/orders/swiggy
 * @desc    Check Swiggy login status and provide instructions
 * @access  Private
 */
router.get('/swiggy', auth, async (req, res) => {
  try {
    console.log('Swiggy route accessed by user:', req.user._id);
    
    // Provide instructions for browser-based approach
    res.json({
      success: true,
      message: 'To import your Swiggy orders, please follow these steps:',
      instructions: [
        '1. Open a new browser tab and go to https://www.swiggy.com/dapi/order/all',
        '2. Make sure you are logged in to Swiggy in that tab',
        '3. Copy the entire JSON response from that page',
        '4. Return to this app and paste the JSON in the text area below',
        '5. Click "Import Orders" to process your data'
      ],
      requiresManualInput: true
    });
  } catch (error) {
    console.error('Error in Swiggy route:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking Swiggy login status',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/orders/swiggy/fetch
 * @desc    Process manually provided Swiggy orders data
 * @access  Private
 */
router.post('/swiggy/fetch', auth, async (req, res) => {
  try {
    const { ordersData } = req.body;
    
    console.log('[DEBUG] Received Swiggy orders data:', 
      typeof ordersData === 'object' ? 'Order object received' : 'Invalid data format');
    
    if (!ordersData) {
      console.log('[DEBUG] No Swiggy orders data provided');
      return res.status(400).json({ 
        success: false, 
        message: 'No orders data provided' 
      });
    }
    
    // Process the Swiggy orders
    const processedOrders = await extractSwiggyOrders(ordersData);
    
    if (processedOrders.length === 0) {
      console.log('[DEBUG] No valid Swiggy orders found in the provided data');
      return res.status(400).json({ 
        success: false, 
        message: 'No valid Swiggy orders found in the provided data' 
      });
    }
    
    console.log(`[DEBUG] Processing ${processedOrders.length} Swiggy orders`);
    const savedOrders = [];
    const errors = [];
    
    for (const orderData of processedOrders) {
      try {
        // Validate required fields
        if (!orderData.orderId || !orderData.restaurantName) {
          console.log(`[DEBUG] Swiggy order ${orderData.orderId || 'unknown'} missing required fields`);
          errors.push(`Order ${orderData.orderId || 'unknown'} missing required fields`);
          continue;
        }
        
        // Parse the order date
        let orderDate;
        try {
          // Try parsing as a standard date string
          orderDate = new Date(orderData.orderDate);
          
          // Validate the date
          if (isNaN(orderDate.getTime())) {
            console.error('Invalid date format:', orderData.orderDate);
            orderDate = new Date(); // Fallback to current date
          }
        } catch (error) {
          console.error('Error parsing date:', error);
          orderDate = new Date(); // Fallback to current date
        }
        
        // Calculate emissions
        let emissionData = {
          transportEmission: 0,
          packagingEmission: 0,
          foodEmission: 0,
          totalEmission: 0
        };
        
        try {
          // For Swiggy, we have distance in the data, so we can calculate transport emissions directly
          const travelDistance = orderData.distanceKm || 0;
          console.log(`[DEBUG] Using travel distance from Swiggy data: ${travelDistance} km`);
          
          // Format items for emission calculation
          let formattedDishString = '';
          if (orderData.items && orderData.items.length > 0) {
            formattedDishString = orderData.items.map(item => 
              `${item.quantity} x ${item.name}`
            ).join(', ');
            console.log(`[DEBUG] Formatted dish string for Swiggy: ${formattedDishString}`);
          }
          
          // Calculate emissions using totalEmissions.js for food and packaging
          let foodEmission = 0;
          let packagingEmission = 0;
          let totalEmission = 0;
          
          if (formattedDishString) {
            // Use calculateFoodEmission but with direct distance from Swiggy data
            console.log('[DEBUG] Calling calculateFoodEmission function with Swiggy data');
            const emissions = await calculateFoodEmission(formattedDishString, travelDistance);
            console.log(`[DEBUG] Received emissions from calculateFoodEmission: ${JSON.stringify(emissions)}`);
            
            // Get food and packaging from calculateFoodEmission
            foodEmission = parseFloat(emissions.food);
            packagingEmission = parseFloat(emissions.packaging);
            
            // But calculate transport emission directly using the distance from Swiggy data
            const transportEmission = calculateTransportEmission(travelDistance);
            
            // Calculate total
            totalEmission = foodEmission + packagingEmission + transportEmission;
            
            emissionData = {
              transportEmission,
              packagingEmission,
              foodEmission,
              totalEmission
            };
          } else {
            // Fallback to local calculation if no dish string could be created
            const transportEmission = calculateTransportEmission(travelDistance);
            foodEmission = 0;
            packagingEmission = calculatePackagingEmission(orderData.items?.length || 1);
            totalEmission = foodEmission + packagingEmission + transportEmission;
            
            emissionData = {
              transportEmission,
              packagingEmission,
              foodEmission,
              totalEmission
            };
          }
          
          console.log(`[DEBUG] Final emission data for Swiggy order: ${JSON.stringify(emissionData)}`);
        } catch (error) {
          console.error('[DEBUG] Error calculating emissions for Swiggy order:', error);
          // Continue with default emission values
        }
        
        // Create the order object
        const order = new Order({
          user: req.user._id,
          platform: 'Swiggy',
          orderId: orderData.orderId,
          restaurantName: orderData.restaurantName,
          orderDate,
          orderAmount: orderData.orderAmount || 0,
          orderStatus: orderData.orderStatus || 'Delivered',
          items: orderData.items || [],
          emissionData,
          deliveryAddress: orderData.deliveryAddress || '',
          restaurantAddress: orderData.restaurantAddress || '',
          distanceKm: orderData.distanceKm || 0
        });
        
        // Save the order
        console.log(`[DEBUG] Saving Swiggy order with emission data: ${JSON.stringify(emissionData)}`);
        await order.save();
        console.log(`[DEBUG] Swiggy order saved successfully: ${order._id}`);
        savedOrders.push(order);
      } catch (error) {
        console.error('[DEBUG] Error processing Swiggy order:', error);
        errors.push(`Error processing order: ${error.message}`);
        // Continue with next order even if one fails
      }
    }
    
    console.log(`[DEBUG] Successfully processed ${savedOrders.length} Swiggy orders${errors.length > 0 ? ` (${errors.length} errors)` : ''}`);
    res.json({ 
      success: true,
      message: `Successfully imported ${savedOrders.length} Swiggy orders${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
      importedCount: savedOrders.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('[DEBUG] Error in Swiggy order processing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing Swiggy orders',
      error: error.message
    });
  }
});

// GENERIC ROUTES

// Create new order
router.post('/', auth, async (req, res) => {
  try {
    const {
      restaurantName,
      date,
      foodItems,
      distance,
      price,
      platform
    } = req.body;

    // Calculate emissions
    const foodEmission = calculateLocalFoodEmission(foodItems);
    const packagingEmission = calculatePackagingEmission(foodItems.length);
    const transportEmission = calculateTransportEmission(distance);

    const order = new Order({
      user: req.user._id,
      restaurantName,
      date,
      foodItems,
      distance,
      price,
      platform,
      foodEmission,
      packagingEmission,
      transportEmission
    });

    await order.save();
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all orders for the user
router.get('/', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ date: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get order by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete order
router.delete('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Fetch orders from Zomato
router.post('/fetch-zomato', auth, async (req, res) => {
  try {
    const orders = await extractZomatoOrders();
    
    // Save orders to database
    const savedOrders = await Promise.all(
      orders.map(order => 
        Order.create({
          ...order,
          user: req.user._id,
          platform: 'Zomato'
        })
      )
    );
    
    res.json(savedOrders);
  } catch (error) {
    console.error('Error fetching Zomato orders:', error);
    res.status(500).json({ error: 'Failed to fetch Zomato orders' });
  }
});

// Fetch orders from Swiggy
router.post('/fetch-swiggy', auth, async (req, res) => {
  try {
    const orders = await extractSwiggyOrders();
    
    // Save orders to database
    const savedOrders = await Promise.all(
      orders.map(order => 
        Order.create({
          ...order,
          user: req.user._id,
          platform: 'Swiggy'
        })
      )
    );
    
    res.json(savedOrders);
  } catch (error) {
    console.error('Error fetching Swiggy orders:', error);
    res.status(500).json({ error: 'Failed to fetch Swiggy orders' });
  }
});

/**
 * @route   POST /api/orders/import
 * @desc    Import orders from various platforms
 * @access  Private
 */
router.post('/import', auth, async (req, res) => {
  try {
    const { ordersData } = req.body;
    
    console.log('[DEBUG] Received orders data for import:', 
      Array.isArray(ordersData) ? `${ordersData.length} orders` : 'Not an array');
    
    if (!ordersData) {
      console.log('[DEBUG] No orders data provided');
      return res.status(400).json({ 
        success: false, 
        message: 'No orders data provided' 
      });
    }
    
    // Handle both array and object formats
    let ordersArray;
    if (Array.isArray(ordersData)) {
      ordersArray = ordersData;
      console.log('[DEBUG] Using orders data as array');
    } else if (ordersData.entities && ordersData.entities.ORDER) {
      // Extract orders from the entities.ORDER object
      ordersArray = Object.values(ordersData.entities.ORDER);
      console.log('[DEBUG] Extracted orders from entities.ORDER');
    } else {
      console.log('[DEBUG] Invalid data format');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid data format. Expected an array of orders or an object with entities.ORDER' 
      });
    }
    
    if (ordersArray.length === 0) {
      console.log('[DEBUG] No orders found in the provided data');
      return res.status(400).json({ 
        success: false, 
        message: 'No orders found in the provided data' 
      });
    }

    console.log(`[DEBUG] Processing ${ordersArray.length} orders`);
    const processedOrders = [];
    const errors = [];

    for (const orderData of ordersArray) {
      try {
        // Extract basic order information
        const orderId = orderData.orderId || orderData.order_id || orderData.id || 'unknown';
        const restaurantName = orderData.resInfo?.name || orderData.restaurantName || orderData.restaurant_name || 'Unknown Restaurant';
        const orderDate = orderData.orderDate || orderData.order_date || orderData.created_at || new Date();
        const orderAmount = orderData.orderAmount || orderData.order_amount || orderData.total || 0;
        
        // Extract items
        const items = [];
        if (orderData.items && Array.isArray(orderData.items)) {
          orderData.items.forEach(item => {
            items.push({
              name: item.name || item.itemName || 'Unknown Item',
              quantity: item.quantity || 1,
              price: item.price || item.totalCost || 0
            });
          });
        }
        
        // Calculate emissions
        const foodEmission = calculateLocalFoodEmission(items);
        const packagingEmission = calculatePackagingEmission(items.length);
        
        // Estimate distance (in km) - this is a placeholder
        const distance = 5; // Default 5km
        const transportEmission = calculateTransportEmission(distance);
        
        const totalEmission = foodEmission + packagingEmission + transportEmission;
        
        const emissionData = {
          transportEmission,
          packagingEmission,
          foodEmission,
          totalEmission,
          factors: {
            transportMode: 'motorcycle', // Default
            distance,
            packagingType: items.length <= 2 ? 'small' : items.length <= 4 ? 'medium' : 'large',
            foodCategories: items.map(item => {
              const name = item.name.toLowerCase();
              if (name.includes('beef')) return 'beef';
              if (name.includes('chicken')) return 'chicken';
              if (name.includes('paneer')) return 'paneer';
              if (name.includes('cheese') || name.includes('cream')) return 'dairy';
              if (name.includes('veg') || name.includes('rice') || name.includes('dal')) return 'vegetarian';
              return 'other';
            })
          }
        };

        // Create the order object
        const order = new Order({
          user: req.user._id,
          platform: 'Zomato',
          orderId: orderId.toString(),
          restaurantName,
          orderDate,
          orderAmount,
          orderStatus: orderData.orderStatus || orderData.status || 'Unknown',
          items,
          emissionData,
          deliveryAddress: orderData.deliveryAddress || orderData.address || 'Unknown',
          createdAt: new Date()
        });

        // Save the order
        console.log(`[DEBUG] Saving order with emission data: ${JSON.stringify(emissionData)}`);
        await order.save();
        console.log(`[DEBUG] Order saved successfully: ${order._id}`);
        processedOrders.push(order);
      } catch (error) {
        console.error('[DEBUG] Error processing order:', error);
        errors.push(`Error processing order: ${error.message}`);
        // Continue with next order even if one fails
      }
    }

    console.log(`[DEBUG] Successfully processed ${processedOrders.length} orders${errors.length > 0 ? ` (${errors.length} errors)` : ''}`);
    res.json({ 
      success: true,
      message: `Successfully imported ${processedOrders.length} orders${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
      importedCount: processedOrders.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('[DEBUG] Error in order import:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error importing orders',
      error: error.message
    });
  }
});

// Get AI recommendations for a specific order
router.get('/:orderId/recommendations', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Get AI-powered recommendations
    const recommendations = await AIService.getOrderRecommendations(order);
    
    res.json({
      order: {
        id: order._id,
        restaurantName: order.restaurantName,
        orderDate: order.orderDate,
        totalEmission: order.emissionData?.totalEmission || 0
      },
      recommendations
    });
  } catch (error) {
    console.error('Error generating AI order recommendations:', error);
    res.status(500).json({ 
      message: 'Error generating recommendations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 