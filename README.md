# Carbon Footprint Tracker - Backend

A Node.js Express backend for tracking and analyzing carbon footprint from food consumption, including delivery orders, menu analysis, and food image recognition.

## Features

- RESTful API for tracking food delivery orders and food analysis
- Carbon footprint calculation based on food type, delivery distance, and packaging
- AI-powered food image analysis using OpenAI Vision API
- Menu sustainability analysis with detailed recommendations
- AI-powered personalized recommendations using OpenAI
- Two-layer caching system (in-memory and database) for optimized performance
- JWT-based authentication
- Comprehensive analytics and insights
- Integration with food delivery platforms (Zomato and Swiggy)

## Tech Stack

- **Node.js** and **Express.js**: Core server framework
- **MongoDB** with **Mongoose**: Database and ODM
- **JSON Web Tokens**: Authentication
- **OpenAI API**: AI-powered recommendations and image analysis
- **OpenAI Vision API**: Food image analysis
- **OpenRouteService API**: Distance calculations
- **Spoonacular API**: Food data
- **Geoapify API**: Location services
- **Sharp**: Image processing and optimization

## Prerequisites

- Node.js 14+ and npm
- MongoDB Atlas account or local MongoDB instance
- API keys for: OpenAI, OpenRouteService, Spoonacular, and Geoapify

## Environment Setup

Create a `.env` file in the root directory with the following variables:
```
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
NODE_ENV=development
OPENROUTESERVICE_API_KEY=your_openroute_api_key
SPOONACULAR_API_KEY=your_spoonacular_api_key
GEOAPIFY_API_KEY=your_geoapify_api_key
OPENAI_API_KEY=your_openai_api_key
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get JWT token

### Orders
- `GET /api/orders` - Get all orders for the logged-in user
- `POST /api/orders` - Create a new order
- `GET /api/orders/:id` - Get a specific order
- `PUT /api/orders/:id` - Update an order
- `DELETE /api/orders/:id` - Delete an order

### Food Analysis
- `POST /api/food-analysis/analyze` - Analyze food image for carbon footprint
- `GET /api/food-analysis/history` - Get analysis history
- `GET /api/food-analysis/:id` - Get specific analysis result

### Menu Analysis
- `POST /api/menu-analysis/analyze` - Analyze restaurant menu
- `GET /api/menu-analysis/history` - Get menu analysis history
- `GET /api/menu-analysis/:id` - Get specific menu analysis

### Insights
- `GET /api/insights/summary` - Get summary of carbon footprint
- `GET /api/insights/trends` - Get emission trends over time
- `GET /api/insights/platform-comparison` - Compare emissions across delivery platforms
- `GET /api/insights/suggestions` - Get suggestions for reducing carbon footprint
- `GET /api/insights/ai-recommendations` - Get AI-powered personalized recommendations

## Services

### AI Services

#### Food Image Analysis Service
- Processes and optimizes uploaded food images
- Uses OpenAI Vision API for ingredient recognition
- Calculates carbon footprint based on identified ingredients
- Provides sustainability ratings and recommendations

#### Menu Analysis Service
- Processes uploaded menu images using OCR
- Analyzes menu items for environmental impact
- Provides sustainability ratings for dishes
- Suggests lower-carbon alternatives

#### Recommendation Service
- Generates personalized recommendations based on user history
- Uses OpenAI for intelligent suggestion generation
- Considers seasonal and local food options

### Caching System

The backend implements a sophisticated caching system for AI operations:

1. **In-memory cache**: 
   - Fast access using JavaScript Maps
   - 15-minute TTL for analysis results
   - Optimized for frequently requested data

2. **Database cache**: 
   - Persistent storage using MongoDB
   - 1-hour TTL for analysis results
   - Stores detailed analysis data

This dual-layer approach optimizes performance while reducing API calls to external services.

## Food Delivery Integration

### Platform Connectors
- **Zomato Connector**: Integration with Zomato's order system
- **Swiggy Connector**: Integration with Swiggy's order system

### Features
- Order history synchronization
- Real-time order tracking
- Carbon footprint calculation for deliveries
- Platform-specific optimizations

## Development

Start the development server with hot reload:
```
npm run dev
```

## Testing

Run the test suite:
```
npm test
```

## Error Handling

The application implements comprehensive error handling:
- Request validation
- API rate limiting
- Error logging and monitoring
- Graceful degradation for AI services

## Security

- JWT-based authentication
- Request rate limiting
- Input sanitization
- Secure credential storage
- CORS configuration
- API key management
