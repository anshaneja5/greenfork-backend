// Carbon Emission Calculator – Food + Packaging + Travel Emissions (JavaScript Version)
// ----------------------------------------------------------------------
// Uses predefined emissions DB or calls Spoonacular API to estimate CO2e for dishes, packaging, and travel

const axios = require('axios');

require('dotenv').config();

/**
 * Food Emissions Database (kg CO₂e per kg of food)
 * Sources:
 * - Our World in Data: https://ourworldindata.org/food-choice-vs-eating-local
 * - Nature Food Journal: https://www.nature.com/articles/s43016-021-00225-9
 * - Carbon Cloud: https://carboncloud.com/food-emissions-database/
 */
const FOOD_EMISSIONS_DB = {
  // Meat and Animal Products (high emissions)
  beef: 60.0,          // Beef has highest carbon footprint
  lamb: 24.0,
  mutton: 24.0,
  pork: 7.0,
  bacon: 7.2,
  ham: 6.8,
  chicken: 6.0,
  turkey: 5.5,
  duck: 9.8,
  eggs: 4.8,
  
  // Seafood
  fish: 5.1,
  salmon: 6.0,
  tuna: 6.1,
  shrimp: 12.0,
  prawns: 12.0,
  
  // Dairy Products
  cheese: 13.5,
  paneer: 13.0,
  milk: 3.2,
  butter: 12.0,
  cream: 9.0,
  yogurt: 2.5,
  ghee: 12.5,
  "cream cheese": 11.8,
  
  // Plant Proteins (low emissions)
  lentils: 0.9,
  tofu: 2.0,
  beans: 1.1,
  chickpeas: 0.9,
  soybeans: 1.0,
  tempeh: 2.2,
  seitan: 1.2,
  "plant-based meat": 3.5,
  
  // Grains
  wheat: 1.6,
  rice: 4.0,  // Higher due to methane from paddy fields
  oats: 1.4,
  barley: 1.0,
  corn: 1.1,
  quinoa: 1.3,
  bread: 1.7,
  pasta: 1.5,
  flour: 1.6,
  
  // Vegetables (low emissions)
  vegetables: 1.5,    // General category
  potatoes: 0.5,
  tomatoes: 1.1,
  onions: 0.5,
  garlic: 0.6,
  "bell pepper": 1.0,
  "tomato puree": 1.8,
  carrots: 0.4,
  broccoli: 0.6,
  spinach: 0.5,
  lettuce: 0.7,
  kale: 0.5,
  cabbage: 0.4,
  cucumber: 0.6,
  eggplant: 0.7,
  mushrooms: 0.6,
  
  // Fruits
  fruits: 1.0,        // General category
  apples: 0.4,
  bananas: 0.8,
  oranges: 0.4,
  berries: 1.1,
  grapes: 1.0,
  mangoes: 1.2,
  
  // Oils, Nuts and Seeds
  oil: 3.3,           // General vegetable oil
  "olive oil": 5.1,
  "coconut oil": 2.3,
  nuts: 2.5,          // General category
  almonds: 3.5,
  walnuts: 2.3,
  cashews: 2.2,
  seeds: 1.8,         // General category
  
  // Spices and Condiments
  spices: 1.5,        // General category
  sugar: 1.9,
  salt: 0.3,
  pepper: 1.1,
  vinegar: 0.9,
  "tomato ketchup": 2.1,
  mayonnaise: 4.5,
  
  // Beverages
  coffee: 17.0,       // Per kg of coffee beans
  tea: 2.0,           // Per kg of tea leaves
  beer: 1.1,          // Per kg (about 3 bottles)
  wine: 1.8,          // Per kg (about 1 bottle)
  "soft drink": 0.5,  // Per kg (about 3 cans)
};

/**
 * Mapping for ingredient name normalization
 * Maps common names or variations to our standard names in the DB
 */
const INGREDIENT_NORMALIZATION = {
  // Legumes
  "garbanzo beans": "chickpeas",
  "chana": "chickpeas",
  "chick peas": "chickpeas",
  "gram": "chickpeas",
  "dahl": "lentils",
  "dal": "lentils",
  "moong": "lentils",
  "masoor": "lentils",
  
  // Grains
  "gram flour": "flour",
  "besan": "flour",
  "maida": "flour",
  "atta": "flour",
  "naan": "bread",
  "chapati": "bread",
  "roti": "bread",
  "paratha": "bread",
  
  // Proteins
  "chicken breast": "chicken",
  "chicken thigh": "chicken",
  "lamb chop": "lamb",
  "ground beef": "beef",
  "minced beef": "beef",
  "steak": "beef",
  "mutton": "lamb",
  "egg": "eggs",
  
  // Vegetables
  "capsicum": "bell pepper", 
  "pepper": "bell pepper",
  "tomato": "tomatoes",
  "onion": "onions",
  "potato": "potatoes",
  "mushroom": "mushrooms",
  "eggplant": "eggplant",
  "aubergine": "eggplant",
  "brinjal": "eggplant",
  
  // Dairy
  "cream cheese": "cheese",
  "cheddar": "cheese",
  "mozzarella": "cheese",
  "parmesan": "cheese",
  "feta": "cheese",
  "cottage cheese": "paneer",
  "creamer": "cream",
  "yoghurt": "yogurt",
  "curd": "yogurt",
  
  // Oils and Fats
  "refined oil": "oil",
  "cooking oil": "oil",
  "vegetable oil": "oil",
  "canola oil": "oil",
  "sunflower oil": "oil",
  "margarine": "butter",
  
  // Sauces and Condiments
  "ketchup": "tomato ketchup",
  "soy sauce": "spices",
  "hot sauce": "spices",
  "chilli sauce": "spices",
  "masala": "spices",
  "garam masala": "spices",
};

/**
 * Food category emission fallbacks (kg CO₂e per kg)
 * Used when specific ingredients aren't found in the database
 */
const INGREDIENT_CATEGORY_FALLBACK = {
  meat: 30.0,         // High value for unknown meats
  seafood: 6.0,
  dairy: 10.0,
  vegetables: 1.0,
  fruits: 1.0,
  grains: 1.6,
  spices: 1.5,
  pulses: 0.9,       // Beans, lentils
  oil: 3.3,
  nuts: 2.5,
  beverages: 1.5,
  processed: 4.0     // Highly processed foods as fallback
};

/**
 * Packaging Emissions (kg CO₂e per unit)
 * Differentiated by packaging material and size
 * Sources:
 * - European Environment Agency
 * - Various LCA (Life Cycle Assessment) studies
 */
const PACKAGING_EMISSIONS = {
  // Different packaging materials
  plastic: {
    small: 0.1,     // Small container (e.g., sauce container)
    medium: 0.2,    // Medium container (e.g., single dish)
    large: 0.4,     // Large container (e.g., family size)
  },
  paper: {
    small: 0.05,    // Small paper bag
    medium: 0.1,    // Medium paper box
    large: 0.2,     // Large paper box
  },
  aluminum: {
    small: 0.15,    // Small aluminum container
    medium: 0.3,    // Medium aluminum tray
    large: 0.5,     // Large aluminum tray
  },
  styrofoam: {
    small: 0.15,    // Small styrofoam container
    medium: 0.25,   // Medium styrofoam box
    large: 0.45,    // Large styrofoam box
  },
  glass: {
    small: 0.3,     // Small glass jar
    medium: 0.5,    // Medium glass container
    large: 0.8,     // Large glass bottle
  }
};

// Default packaging per dish when type is unknown
const DEFAULT_PACKAGING = {
  type: "plastic",
  size: "medium"
};

// Previous constant used for backward compatibility
const PACKAGING_EMISSION_PER_DISH = 0.2; // kg CO₂e per dish for average packaging

/**
 * Travel Emissions (kg CO₂e per km)
 * Sources:
 * - DEFRA (UK Dept for Environment, Food & Rural Affairs)
 * - European Environment Agency transport emissions data
 */
const TRAVEL_EMISSIONS = {
  "motorcycle": 0.115,    // Typical delivery bike
  "scooter": 0.09,        // Electric scooter
  "car": 0.18,            // Average car
  "electric-car": 0.06,   // Electric car
  "van": 0.23,            // Small delivery van
  "bicycle": 0.008,       // Includes lifecycle emissions of bicycle
  "e-bicycle": 0.01,      // Electric bicycle
  "walking": 0.0          // Zero direct emissions
};

// Default transport type when not specified
const DEFAULT_TRANSPORT = "motorcycle";

// Previous constant used for backward compatibility
const TRAVEL_EMISSION_PER_KM = 0.105; // kg CO₂e per km for average delivery

// API Keys
const OPENROUTESERVICE_API_KEY = process.env.OPENROUTESERVICE_API_KEY;
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;

/**
 * Recipe database for common dishes
 * Values in grams per standard serving
 */
const RECIPE_DB = {
  "kadhai paneer": {
    paneer: 100,
    "bell pepper": 50,
    onions: 50,
    tomatoes: 100,
    oil: 10,
    spices: 5
  },
  "tawa roti": {
    wheat: 50,
    oil: 2
  },
  "dal fry": {
    lentils: 100,
    onions: 30,
    tomatoes: 50,
    oil: 10,
    spices: 5
  },
  "chicken curry": {
    chicken: 150,
    onions: 50,
    tomatoes: 100,
    oil: 15,
    spices: 8
  },
  "chole kulche": {
    chickpeas: 150,
    onions: 30,
    tomatoes: 50,
    oil: 10,
    flour: 80,
    butter: 5,
    spices: 8
  },
  "butter chicken": {
    chicken: 200,
    butter: 30,
    cream: 50,
    tomatoes: 100,
    onions: 30,
    spices: 10
  },
  "palak paneer": {
    paneer: 100,
    spinach: 200,
    onions: 30,
    tomatoes: 20,
    cream: 20,
    oil: 10,
    spices: 5
  },
  "biryani": {
    rice: 150,
    chicken: 100, // Optional, removed for veg
    onions: 50,
    oil: 15,
    spices: 10
  },
  "naan": {
    flour: 80,
    yogurt: 20,
    butter: 10
  },
  "samosa": {
    flour: 50,
    potatoes: 80,
    peas: 20,
    oil: 30,
    spices: 5
  }
};

/**
 * Fetch ingredients for a dish from Spoonacular API
 * @param {string} dishName - Name of the dish
 * @return {Object} - Object with ingredients and their quantities in grams
 */
async function fetchIngredientsFromAPI(dishName) {
  try {
    // First search for the recipe
    const searchRes = await axios.get("https://api.spoonacular.com/recipes/complexSearch", {
      params: {
        query: dishName,
        number: 1,
        addRecipeInformation: true,
        apiKey: SPOONACULAR_API_KEY
      }
    });

    const results = searchRes.data.results;
    if (!results || results.length === 0) {
      console.log(`No recipe found for ${dishName}, using fallback method`);
      return estimateDishIngredients(dishName);
    }

    // Get detailed ingredient information
    const recipeId = results[0].id;
    const detailsRes = await axios.get(
      `https://api.spoonacular.com/recipes/${recipeId}/ingredientWidget.json`,
      { params: { apiKey: SPOONACULAR_API_KEY } }
    );

    const ingredients = detailsRes.data.ingredients;
    const result = {};

    // Process each ingredient
    for (const item of ingredients) {
      let name = item.name.toLowerCase();
      // Normalize ingredient name
      name = INGREDIENT_NORMALIZATION[name] || name;
      const amount = item.amount.metric.value; // in grams
      result[name] = amount;
    }

    return result;
  } catch (err) {
    console.error(`Error fetching ingredients for ${dishName}:`, err.message);
    // Fall back to estimation if API fails
    return estimateDishIngredients(dishName);
  }
}

/**
 * Fallback method to estimate dish ingredients when API fails
 * Uses word matching and dish categories to make educated guesses
 * @param {string} dishName - Name of the dish
 * @return {Object} - Estimated ingredients
 */
function estimateDishIngredients(dishName) {
  const name = dishName.toLowerCase();
  
  // Check for matches in name to categorize the dish
  if (name.includes("chicken") || name.includes("murgh")) {
    return {
      chicken: 150,
      onions: 40,
      tomatoes: 60,
      oil: 15,
      spices: 10
    };
  }
  
  if (name.includes("paneer")) {
    return {
      paneer: 100,
      onions: 40,
      tomatoes: 60,
      oil: 10,
      spices: 8
    };
  }
  
  if (name.includes("dal") || name.includes("lentil")) {
    return {
      lentils: 100,
      onions: 30,
      tomatoes: 40,
      oil: 10,
      spices: 5
    };
  }
  
  if (name.includes("rice") || name.includes("biryani") || name.includes("pulao")) {
    let result = {
      rice: 150,
      onions: 30,
      oil: 15,
      spices: 8
    };
    
    // Add protein if it seems to have it
    if (name.includes("chicken") || name.includes("murgh")) {
      result.chicken = 100;
    } else if (name.includes("mutton") || name.includes("lamb")) {
      result.lamb = 100;
    } else if (name.includes("veg")) {
      result.vegetables = 100;
    }
    
    return result;
  }
  
  if (name.includes("roti") || name.includes("naan") || name.includes("bread")) {
    return {
      flour: 80,
      oil: 5
    };
  }
  
  // Default vegetable curry as fallback
  return {
    vegetables: 150,
    onions: 40,
    tomatoes: 50,
    oil: 10,
    spices: 5
  };
}

/**
 * Compute emissions from ingredients
 * @param {Object} ingredients - Object with ingredients and their quantities in grams
 * @return {number} - Total emissions in kg CO₂e
 */
function computeEmissionFromIngredients(ingredients) {
  if (!ingredients || Object.keys(ingredients).length === 0) {
    return 1.5; // Default emissions if no ingredients (average vegetable dish)
  }
  
  return Object.entries(ingredients).reduce((total, [ingredient, grams]) => {
    const kg = grams / 1000.0; // Convert grams to kg
    const emissionFactor = FOOD_EMISSIONS_DB[ingredient] || estimateEmissionCategory(ingredient);
    
    // Add the emissions for this ingredient
    return total + emissionFactor * kg;
  }, 0);
}

/**
 * Estimate emission category for unknown ingredients
 * Uses keyword matching to categorize ingredients
 * @param {string} ingredient - Ingredient name
 * @return {number} - Emission factor in kg CO₂e per kg
 */
function estimateEmissionCategory(ingredient) {
  const lower = ingredient.toLowerCase();
  
  // Meat and animal products
  if (lower.includes("meat") || 
      lower.includes("beef") || 
      lower.includes("lamb") || 
      lower.includes("pork") || 
      lower.includes("veal")) {
    return INGREDIENT_CATEGORY_FALLBACK.meat;
  }
  
  // Seafood
  if (lower.includes("fish") || 
      lower.includes("prawn") || 
      lower.includes("shrimp") || 
      lower.includes("salmon") || 
      lower.includes("seafood")) {
    return INGREDIENT_CATEGORY_FALLBACK.seafood;
  }
  
  // Dairy
  if (lower.includes("milk") || 
      lower.includes("cream") || 
      lower.includes("cheese") || 
      lower.includes("curd") || 
      lower.includes("yogurt") || 
      lower.includes("butter") || 
      lower.includes("ghee")) {
    return INGREDIENT_CATEGORY_FALLBACK.dairy;
  }
  
  // Grains
  if (lower.includes("flour") || 
      lower.includes("bread") || 
      lower.includes("roti") || 
      lower.includes("naan") || 
      lower.includes("rice") || 
      lower.includes("cereal") || 
      lower.includes("grain") || 
      lower.includes("pasta")) {
    return INGREDIENT_CATEGORY_FALLBACK.grains;
  }
  
  // Pulses
  if (lower.includes("chickpeas") || 
      lower.includes("lentils") || 
      lower.includes("dal") || 
      lower.includes("beans") || 
      lower.includes("peas")) {
    return INGREDIENT_CATEGORY_FALLBACK.pulses;
  }
  
  // Oils and fats
  if (lower.includes("oil") || 
      lower.includes("fat") || 
      lower.includes("ghee")) {
    return INGREDIENT_CATEGORY_FALLBACK.oil;
  }
  
  // Spices and condiments
  if (lower.includes("spice") || 
      lower.includes("masala") || 
      lower.includes("powder") || 
      lower.includes("sauce") || 
      lower.includes("paste") || 
      lower.includes("extract")) {
    return INGREDIENT_CATEGORY_FALLBACK.spices;
  }
  
  // Nuts and seeds
  if (lower.includes("nut") || 
      lower.includes("almond") || 
      lower.includes("cashew") || 
      lower.includes("seed")) {
    return INGREDIENT_CATEGORY_FALLBACK.nuts;
  }
  
  // Beverages
  if (lower.includes("drink") || 
      lower.includes("juice") || 
      lower.includes("tea") || 
      lower.includes("coffee")) {
    return INGREDIENT_CATEGORY_FALLBACK.beverages;
  }
  
  // Processed foods
  if (lower.includes("processed") || 
      lower.includes("frozen") || 
      lower.includes("ready") || 
      lower.includes("instant")) {
    return INGREDIENT_CATEGORY_FALLBACK.processed;
  }
  
  // Default to vegetables if nothing else matches
  return INGREDIENT_CATEGORY_FALLBACK.vegetables;
}

/**
 * Get coordinates from address using Geoapify API
 * @param {string} address - Address string
 * @return {Object|null} - Coordinates {lat, lng} or null if geocoding fails
 */
async function getCoordinatesFromAddress(address) {
  if (!address || !address.trim()) {
    console.error("Empty address provided for geocoding");
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    console.log("encodedAddress", encodedAddress);
    const apiKey = process.env.GEOAPIFY_API_KEY;
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodedAddress}&filter=countrycode:in&apiKey=${apiKey}`;
    
    console.log(`Geocoding address: ${address}`);
    const response = await axios.get(url);
    const data = response.data;
    console.log("data", data.features[0]);
    if (!data.features || data.features.length === 0) {
      console.error("Geocoding failed. No coordinates found for address:", address);
      return null;
    }

    const coords = data.features[0].geometry.coordinates;
    return { lng: coords[0], lat: coords[1] };
  } catch (err) {
    console.error("Error in geocoding address:", address, err.message);
    return null;
  }
}

/**
 * Calculate travel distance between two points
 * @param {string} originAddress - Origin address
 * @param {Object} destCoords - Destination coordinates {lat, lng}
 * @param {string} transportType - Type of transport (defaults to "motorcycle")
 * @return {Object} - Distance in km and transportation details
 */
async function getTravelDistanceKm(originAddress, destCoords, transportType = DEFAULT_TRANSPORT) {
  console.log(`Calculating travel distance from ${originAddress} to coordinates ${destCoords?.lat}, ${destCoords?.lng} using ${transportType}`);
  
  // Input validation
  if (!originAddress || !destCoords) {
    console.warn("Missing origin address or destination coordinates");
    return {
      distance: 5, // fallback default
      transportType,
      emissionFactor: TRAVEL_EMISSIONS[transportType] || TRAVEL_EMISSIONS[DEFAULT_TRANSPORT]
    };
  }
  
  // Get coordinates for the origin address using Geoapify
  const originCoords = await getCoordinatesFromAddress(originAddress);
  console.log("Origin coordinates:", originCoords);
  
  if (!originCoords) {
    console.warn("Falling back to default travel distance of 5 km due to geocoding failure.");
    return {
      distance: 5, // fallback default
      transportType,
      emissionFactor: TRAVEL_EMISSIONS[transportType] || TRAVEL_EMISSIONS[DEFAULT_TRANSPORT]
    };
  }

  try {
    // Prepare request body for routing
  const body = {
    coordinates: [
      [originCoords.lng, originCoords.lat],
      [destCoords.lng, destCoords.lat]
      ],
      // Choose appropriate profile for the transportation type
      profile: transportType === "bicycle" || transportType === "e-bicycle" ? "cycling-regular" : "driving-car",
      preference: "recommended"
  };

    console.log(`Requesting route from OpenRouteService: ${JSON.stringify(body)}`);
    
    // Get route from OpenRouteService
  const res = await axios.post("https://api.openrouteservice.org/v2/directions/driving-car", body, {
    headers: {
      Authorization: OPENROUTESERVICE_API_KEY,
      "Content-Type": "application/json"
    }
  });

    // Extract distance and convert to km
  const meters = res.data.routes[0].summary.distance;
    const km = meters / 1000.0;
    console.log(`Route distance: ${km} km`);
    
    // Return distance and emissions data
    return {
      distance: km,
      transportType,
      emissionFactor: TRAVEL_EMISSIONS[transportType] || TRAVEL_EMISSIONS[DEFAULT_TRANSPORT]
    };
  } catch (error) {
    console.error("Error calculating route:", error.message);
    // Fallback to a default distance
    return {
      distance: 5, // fallback default
      transportType,
      emissionFactor: TRAVEL_EMISSIONS[transportType] || TRAVEL_EMISSIONS[DEFAULT_TRANSPORT]
    };
  }
}

/**
 * Calculate packaging emissions based on order details
 * @param {number} numberOfDishes - Number of dishes in the order
 * @param {string} packagingType - Type of packaging (plastic, paper, etc.)
 * @param {string} packagingSize - Size of packaging (small, medium, large)
 * @return {number} - Total packaging emissions in kg CO₂e
 */
function calculatePackagingEmissions(numberOfDishes, packagingType = DEFAULT_PACKAGING.type, packagingSize = DEFAULT_PACKAGING.size) {
  // Validate input and use defaults if needed
  const type = PACKAGING_EMISSIONS[packagingType] ? packagingType : DEFAULT_PACKAGING.type;
  const size = PACKAGING_EMISSIONS[type][packagingSize] ? packagingSize : DEFAULT_PACKAGING.size;
  
  // Get emission factor for this packaging type and size
  const emissionFactor = PACKAGING_EMISSIONS[type][size];
  
  // Standard additional packaging (bag, napkins, cutlery)
  const additionalEmissions = 0.05;
  
  return (emissionFactor * numberOfDishes) + additionalEmissions;
}

/**
 * Main function to calculate total food, packaging, and travel emissions
 * @param {string} dishString - String of dishes in format "2 x butter chicken, 1 x naan"
 * @param {number|Object} travelDetails - Distance in km or detailed travel object
 * @param {string} packagingType - Type of packaging (plastic, paper, etc.)
 * @return {Object} - Detailed emissions breakdown
 */
async function calculateFoodEmission(dishString, travelDetails = 0, packagingType = "plastic") {
  console.log(`[DEBUG] calculateFoodEmission called with dishString: "${dishString}", travelDetails: ${JSON.stringify(travelDetails)}`);
  
  // Handle empty dishes
  if (!dishString) {
    console.warn("[DEBUG] No dishString provided, returning default emissions");
    
    // Process travel details
    let travelEmission = 0;
    let travelDistance = 0;
    let transportType = DEFAULT_TRANSPORT;
    
    if (typeof travelDetails === 'object' && travelDetails.distance) {
      travelDistance = travelDetails.distance;
      transportType = travelDetails.transportType || DEFAULT_TRANSPORT;
      travelEmission = travelDistance * (travelDetails.emissionFactor || TRAVEL_EMISSIONS[transportType]);
    } else if (typeof travelDetails === 'number') {
      travelDistance = travelDetails;
      travelEmission = travelDistance * TRAVEL_EMISSIONS[transportType];
    }
    
    return {
      food: "0.00",
      packaging: "0.00",
      travel: travelEmission.toFixed(2),
      travelDistance: travelDistance.toFixed(2),
      transportType,
      total: travelEmission.toFixed(2),
      details: {
        dishes: [],
        ingredients: {}
      }
    };
  }
  
  // Parse dishes from the input string
  const dishes = dishString.toLowerCase().split(",").map(s => s.trim());
  console.log(`[DEBUG] Parsed dishes: ${JSON.stringify(dishes)}`);
  
  let totalFoodEmission = 0.0;
  let totalDishCount = 0;
  let allIngredients = {};
  let dishDetails = [];

  // Process each dish
  for (const item of dishes) {
    const match = item.match(/(\d+) x (.+)/);
    if (!match) {
      console.log(`[DEBUG] Skipping item with invalid format: ${item}`);
      continue;
    }

    const count = parseInt(match[1]);
    const dishName = match[2].trim();
    console.log(`[DEBUG] Processing dish: ${count} x ${dishName}`);
    totalDishCount += count;
    
    let ingredients = {};

    // Try to find recipe in our database first
    if (RECIPE_DB[dishName]) {
      console.log(`[DEBUG] Found recipe in database: ${dishName}`);
      ingredients = RECIPE_DB[dishName];
    } else {
      // Otherwise fetch from API or estimate
      console.log(`[DEBUG] Fetching ingredients for: ${dishName}`);
      ingredients = await fetchIngredientsFromAPI(dishName);
    }

    console.log(`[DEBUG] Ingredients for ${dishName}: ${JSON.stringify(ingredients)}`);

    // Calculate emissions for this dish
    const emission = computeEmissionFromIngredients(ingredients);
    console.log(`[DEBUG] Emission for ${dishName}: ${emission} kg CO₂e`);
    
    // Add to running total
    totalFoodEmission += emission * count;
    
    // Track ingredients for detailed breakdown
    for (const [ingredient, amount] of Object.entries(ingredients)) {
      if (allIngredients[ingredient]) {
        allIngredients[ingredient] += amount * count;
      } else {
        allIngredients[ingredient] = amount * count;
      }
    }
    
    // Add dish details
    dishDetails.push({
      name: dishName,
      count,
      emission: emission.toFixed(2),
      totalEmission: (emission * count).toFixed(2),
      ingredients
    });
  }

  // Calculate packaging emissions
  let packagingEmission;
  
  if (packagingType && PACKAGING_EMISSIONS[packagingType]) {
    // Use new detailed packaging calculation
    packagingEmission = calculatePackagingEmissions(
      totalDishCount, 
      packagingType, 
      totalDishCount > 2 ? "large" : "medium"
    );
  } else {
    // Fallback to old method for backward compatibility
    packagingEmission = PACKAGING_EMISSION_PER_DISH * totalDishCount;
  }
  
  // Process travel details
  let travelEmission;
  let travelDistance;
  let transportType = DEFAULT_TRANSPORT;
  
  if (typeof travelDetails === 'object' && travelDetails.distance) {
    // Use new detailed travel calculation
    travelDistance = travelDetails.distance;
    transportType = travelDetails.transportType || DEFAULT_TRANSPORT;
    travelEmission = travelDistance * (travelDetails.emissionFactor || TRAVEL_EMISSIONS[transportType]);
  } else if (typeof travelDetails === 'number') {
    // Fallback to old method for backward compatibility
    travelDistance = travelDetails;
    transportType = DEFAULT_TRANSPORT;
    travelEmission = travelDistance * TRAVEL_EMISSION_PER_KM;
  } else {
    // No travel details provided
    travelDistance = 0;
    travelEmission = 0;
  }
  
  console.log(`[DEBUG] Travel emission: ${travelEmission} kg CO₂e`);

  // Calculate ingredient emission percentages
  const ingredientEmissions = {};
  let totalIngredientEmission = 0;
  
  for (const [ingredient, amount] of Object.entries(allIngredients)) {
    const kg = amount / 1000.0;
    const emissionFactor = FOOD_EMISSIONS_DB[ingredient] || estimateEmissionCategory(ingredient);
    const emission = emissionFactor * kg;
    totalIngredientEmission += emission;
    ingredientEmissions[ingredient] = {
      amount: amount.toFixed(1),
      emission: emission.toFixed(2)
    };
  }
  
  // Add percentage to each ingredient
  for (const ingredient in ingredientEmissions) {
    const emission = parseFloat(ingredientEmissions[ingredient].emission);
    ingredientEmissions[ingredient].percentage = 
      totalIngredientEmission > 0 
        ? ((emission / totalIngredientEmission) * 100).toFixed(1) 
        : "0.0";
  }

  // Construct detailed result object
  const result = {
    food: totalFoodEmission.toFixed(2),
    packaging: packagingEmission.toFixed(2),
    travel: travelEmission.toFixed(2),
    travelDistance: travelDistance.toFixed(2),
    transportType,
    total: (totalFoodEmission + packagingEmission + travelEmission).toFixed(2),
    details: {
      dishes: dishDetails,
      ingredients: ingredientEmissions,
      dishCount: totalDishCount,
      packagingType
    }
  };
  
  console.log(`[DEBUG] Total emissions: ${JSON.stringify(result)}`);
  return result;
}

// Test with a real example
async function testWithRealExample() {
  const dishString = "2 x butter chicken, 1 x naan";
  const travelDistance = 7.5; // km
  
  console.log("Testing with real example:");
  console.log(`Dishes: ${dishString}`);
  console.log(`Travel distance: ${travelDistance} km`);
  
  const result = await calculateFoodEmission(dishString, travelDistance);
  
  console.log("Results:");
  console.log(`Food emissions: ${result.food} kg CO₂e`);
  console.log(`Packaging emissions: ${result.packaging} kg CO₂e`);
  console.log(`Travel emissions: ${result.travel} kg CO₂e`);
  console.log(`Total emissions: ${result.total} kg CO₂e`);
  
  console.log("Comparing with reference data:");
  // Reference data from Carbon Cloud's food emissions database and DEFRA transport emissions
  console.log("Expected food emissions (approx): 1.80-2.20 kg CO₂e");
  console.log("Expected packaging (approx): 0.25-0.40 kg CO₂e");
  console.log("Expected travel emissions (7.5km motorcycle): 0.86 kg CO₂e");
  console.log("Expected total (approx): 2.91-3.46 kg CO₂e");
  
  return result;
}

// Export the functions
module.exports = {
  calculateFoodEmission,
  getTravelDistanceKm,
  calculatePackagingEmissions,
  testWithRealExample,
  computeEmissionFromIngredients,
  estimateEmissionCategory,
  getCoordinatesFromAddress
};
