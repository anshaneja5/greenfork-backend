# Carbon Footprint Tracker - Backend

A Node.js Express backend for tracking and analyzing carbon footprint from food delivery orders from platfrom like Zomato and Swiggy.

## Features

- RESTful API for tracking food delivery orders
- Carbon footprint calculation based on food type, delivery distance, and packaging
- AI-powered personalized recommendations using OpenAI
- Two-layer caching system (in-memory and database) for optimized performance
- JWT-based authentication
- Comprehensive analytics and insights

## Tech Stack

- **Node.js** and **Express.js**: Core server framework
- **MongoDB** with **Mongoose**: Database and ODM
- **JSON Web Tokens**: Authentication
- **OpenAI API**: AI-powered recommendations
- **OpenRouteService API**: Distance calculations
- **Spoonacular API**: Food data
- **Geoapify API**: Location services

## Prerequisites

- Node.js 14+ and npm
- MongoDB Atlas account or local MongoDB instance
- API keys for: OpenAI, OpenRouteService, Spoonacular, and Geoapify

## Environment Setup

Create a `.env` file in the root directory with the following variables:
- PORT=5000
- MONGODB_URI=your_mongodb_connection_string
- JWT_SECRET=your_jwt_secret
- NODE_ENV=development
- OPENROUTESERVICE_API_KEY=your_openroute_api_key
- SPOONACULAR_API_KEY=your_spoonacular_api_key
- GEOAPIFY_API_KEY=your_geoapify_api_key
- OPENAI_API_KEY=your_openai_api_key


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

### Insights
- `GET /api/insights/summary` - Get summary of carbon footprint
- `GET /api/insights/trends` - Get emission trends over time
- `GET /api/insights/platform-comparison` - Compare emissions across delivery platforms
- `GET /api/insights/suggestions` - Get suggestions for reducing carbon footprint
- `GET /api/insights/ai-recommendations` - Get AI-powered personalized recommendations


## AI Service and Caching

The backend implements a sophisticated caching system for AI recommendations:

1. **In-memory cache**: Fast access using JavaScript Maps with a 15-minute TTL
2. **Database cache**: Persistent storage using MongoDB with a 1-hour TTL

This dual-layer approach optimizes performance while reducing API calls to OpenAI.

## Development

Start the development server with hot reload:
npm run dev


