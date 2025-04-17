const axios = require('axios');

/**
 * Extracts order data from Swiggy
 * Processes JSON data provided by the user
 * @param {Object} jsonData - Raw Swiggy order data JSON
 * @returns {Array} Array of processed order objects
 */
async function extractSwiggyOrders(jsonData) {
  try {
    console.log('Starting Swiggy order extraction...');

    if (!jsonData || !jsonData.data || !jsonData.data.orders || !Array.isArray(jsonData.data.orders)) {
      console.error('Invalid Swiggy data format');
      return [];
    }

    const swiggyOrders = jsonData.data.orders;
    console.log(`Processing ${swiggyOrders.length} Swiggy orders`);

    // Process each order
    const processedOrders = swiggyOrders.map(order => {
      try {
        // Extract basic order details
        const orderId = order.order_id.toString();
        const restaurantName = order.restaurant_name || '';
        const orderDate = order.order_time || '';
        const orderTotal = parseFloat(order.order_total) || 0;
        const orderStatus = order.order_status || '';
        
        // Extract order items
        const items = order.order_items ? order.order_items.map(item => ({
          name: item.name || '',
          quantity: parseInt(item.quantity) || 1,
          price: parseFloat(item.base_price) || 0
        })) : [];

        // Extract restaurant and delivery addresses
        const restaurantAddress = order.restaurant_address || '';
        const deliveryAddress = order.delivery_address ? 
          (order.delivery_address.address || order.delivery_address.address_line1 || '') : '';

        // Extract travel distance
        const distanceKm = parseFloat(order.restaurant_customer_distance) || 0;

        return {
          orderId,
          restaurantName,
          orderDate,
          orderAmount: orderTotal,
          orderStatus,
          items,
          restaurantAddress,
          deliveryAddress,
          distanceKm,
          platform: 'Swiggy'
        };
      } catch (err) {
        console.error(`Error processing Swiggy order ${order.order_id}:`, err);
        return null;
      }
    }).filter(order => order !== null);

    console.log(`Successfully processed ${processedOrders.length} Swiggy orders`);
    return processedOrders;
  } catch (error) {
    console.error('Error extracting Swiggy orders:', error);
    return [];
  }
}

module.exports = extractSwiggyOrders; 