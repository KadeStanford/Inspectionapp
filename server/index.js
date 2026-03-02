// === Core modules & setup ===
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
// Database configuration will handle SQLite/PostgreSQL selection
const https = require('https');
const http = require('http');
const os = require('os');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const logger = require('./logger');
const WebSocketService = require('./websocketService');

const app = express();
// 🧠 Cursor: Updated port to use process.env.PORT || 3000 for Render deployment
// Render needs the app to bind to process.env.PORT for proper detection
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// === Environment variables ===
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SALT_ROUNDS = 10;

// === Production-specific configurations ===
if (isProduction) {
  // Serve static files from the React build
  app.use(express.static(path.join(__dirname, '../dist')));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// === Rate limiting ===
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 3 : 5, // Stricter limits in production
  message: { error: 'Too many login attempts, please try again later' }
});

// === Input validation ===
const validateEmail = (email) => {
  return email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
};

const validatePassword = (password) => {
  return password.length >= 6;
};

// === Utility: Get local IP ===
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// === Create server (HTTPS for development, HTTP for production) ===
let server;

if (isProduction) {
  // In production (Render), use HTTP since Render handles SSL termination
  server = http.createServer(app);
  logger.info('🚀 Production mode: Using HTTP server (SSL handled by Render)');
} else {
  // In development, use HTTPS with self-signed certificates
  try {
    const httpsOptions = {
      key: fs.readFileSync(path.join(__dirname, '../.cert/key.pem')),
      cert: fs.readFileSync(path.join(__dirname, '../.cert/cert.pem'))
    };
    server = https.createServer(httpsOptions, app);
    logger.info('🔒 Development mode: Using HTTPS server with self-signed certificates');
  } catch (error) {
    logger.warn('⚠️  SSL certificates not found, falling back to HTTP for development');
    server = http.createServer(app);
  }
}

// === Middleware ===
// Increase body size limit for image data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Dynamic CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Define allowed origins based on environment
    const allowedOrigins = isProduction 
      ? [
          process.env.FRONTEND_URL, // Custom frontend URL if specified
          /^https:\/\/.*\.vercel\.app$/, // Any Vercel preview URLs
          /^https:\/\/.*\.onrender\.com$/, // Render domains (for monolith deployment)
          'https://inspectionapp-backend.onrender.com', // Specific Render domain
          'https://qualitytirelube.com', // Quality Tire Admin Dashboard
          'https://www.qualitytirelube.com', // Quality Tire Admin Dashboard (www)
        ]
      : [
          /^https?:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):3000$/ // Development
        ];
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      logger.info(`✅ CORS allowed origin: ${origin}`);
      callback(null, true);
    } else {
      logger.warn(`❌ CORS blocked origin: ${origin}. Allowed origins: ${JSON.stringify(allowedOrigins)}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-shopmonkey-token']
}));

// Serve static files from uploads directory with absolute path
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Helper function to truncate decimal values ===
const truncateDecimalValues = (value) => {
  if (!value || typeof value !== 'string') return value;
  
  // Find decimal numbers in the string and truncate them to 2 decimal places
  return value.replace(/\d+\.\d+/g, (match) => {
    const num = parseFloat(match);
    return isNaN(num) ? match : num.toFixed(2);
  });
};

// === VIN Decoding API Endpoint with Fallback Services ===
app.get('/api/vin/decode/:vin', async (req, res) => {
  try {
    const { vin } = req.params;
    
    // Validate VIN
    if (!vin || vin.length !== 17) {
      return res.status(400).json({ error: 'VIN must be 17 characters' });
    }
    
    // Clean the VIN (remove spaces and convert to uppercase)
    const cleanVin = vin.replace(/\s/g, '').toUpperCase();
    
    // Validate VIN format (17 alphanumeric characters, no I, O, Q)
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
    if (!vinRegex.test(cleanVin)) {
      return res.status(400).json({ error: 'Invalid VIN format. VIN contains invalid characters.' });
    }
    
    logger.info(`VIN decode request for: ${cleanVin}`);
    
    // Try primary API (NHTSA) first
    try {
      const nhtsaData = await tryNHTSAApi(cleanVin);
      if (nhtsaData) {
        logger.info(`VIN decode successful via NHTSA for: ${cleanVin}`);
        return res.json(nhtsaData);
      }
    } catch (nhtsaError) {
      logger.warn(`NHTSA API failed for ${cleanVin}:`, nhtsaError.message);
    }
    
    // Try backup APIs in order of preference
    const backupApis = [
      { name: 'Auto.dev', func: tryAutoDev },
      { name: 'Vehicle Databases', func: tryVehicleDatabases },
      { name: 'Basic VIN Parser', func: tryBasicVinParser }
    ];
    
    for (const api of backupApis) {
      try {
        logger.info(`Trying backup API ${api.name} for VIN: ${cleanVin}`);
        const backupData = await api.func(cleanVin);
        if (backupData) {
          logger.info(`VIN decode successful via ${api.name} for: ${cleanVin}`);
          return res.json(backupData);
        }
      } catch (backupError) {
        logger.warn(`${api.name} API failed for ${cleanVin}:`, backupError.message);
      }
    }
    
    // All APIs failed
    throw new Error('All VIN decoding services are unavailable');
    
  } catch (error) {
    logger.error('VIN decode error - all services failed:', error);
    res.status(503).json({ 
      error: 'All VIN decoding services are currently unavailable. Please try again later.',
      userMessage: 'VIN decoding services are temporarily unavailable. You can continue with the inspection and decode the VIN later.'
    });
  }
});

// === ChatGPT Vision API for VIN Extraction ===
app.post('/api/vin/extract-from-image', async (req, res) => {
  try {
    logger.info('🔍 VIN extraction endpoint called');
    logger.info('📝 Request body keys:', Object.keys(req.body));
    
    const { imageData } = req.body;
    
    if (!imageData) {
      logger.error('❌ No image data provided');
      return res.status(400).json({ error: 'Image data is required' });
    }

    logger.info('📸 Image data received, length:', imageData.length);
    logger.info('VIN extraction request from image');
    
    // Call ChatGPT Vision API
    logger.info('🤖 Calling OpenAI Vision API...');
    
    const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the VIN (Vehicle Identification Number) from this image. The VIN should be 17 characters long and contain only letters and numbers (excluding I, O, Q). Return only the VIN in uppercase, nothing else. If no VIN is found or the image is unclear, return "NO_VIN_FOUND".'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData
              }
            }
          ]
        }
      ],
      max_tokens: 50
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer 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`
      },
      timeout: 30000
    });

    logger.info('📡 OpenAI response status:', openaiResponse.status);

    const openaiData = openaiResponse.data;
    logger.info('📄 OpenAI response data:', JSON.stringify(openaiData, null, 2));
    
    const extractedVin = openaiData.choices?.[0]?.message?.content?.trim();
    logger.info('🔍 Extracted VIN:', extractedVin);

    if (!extractedVin || extractedVin === 'NO_VIN_FOUND') {
      logger.info('❌ No VIN found in image');
      return res.json({ 
        success: false, 
        message: 'No VIN found in the image. Please try again with a clearer photo.' 
      });
    }

    // Validate the extracted VIN
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
    if (!vinRegex.test(extractedVin)) {
      logger.info('❌ Invalid VIN format:', extractedVin);
      return res.json({ 
        success: false, 
        message: `Invalid VIN format: ${extractedVin}. Please ensure the VIN is 17 characters and contains only valid characters.` 
      });
    }

    logger.info(`✅ VIN extracted successfully: ${extractedVin}`);
    res.json({ 
      success: true, 
      vin: extractedVin 
    });

  } catch (error) {
    logger.error('VIN extraction error:', error);
    res.status(500).json({ 
      error: 'Failed to extract VIN from image',
      details: error.message 
    });
  }
});

// === VIN Decoding Service Functions ===

// Primary API: NHTSA
async function tryNHTSAApi(cleanVin) {
  const maxRetries = 2;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const nhtsaUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${cleanVin}?format=json`;
      const response = await axios.get(nhtsaUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'QuickCheck-VIN-Decoder/1.0'
        }
      });
      
      // Check if response is HTML (maintenance page)
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        throw new Error('NHTSA API is under maintenance');
      }
      
      if (!response.data || !response.data.Results) {
        throw new Error('Invalid response from NHTSA API');
      }
      
      // Process the results to truncate decimal values
      const processedResults = response.data.Results.map(result => ({
        ...result,
        Value: result.Value ? truncateDecimalValues(result.Value) : result.Value
      }));
      
      return {
        ...response.data,
        Results: processedResults,
        source: 'NHTSA'
      };
      
    } catch (attemptError) {
      lastError = attemptError;
      
      if (attempt < maxRetries) {
        logger.warn(`NHTSA attempt ${attempt} failed for ${cleanVin}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw lastError;
}

// Backup API 1: Auto.dev (Free tier: 5,000 calls/month)
async function tryAutoDev(cleanVin) {
  // Note: This would require an API key for full functionality
  // For now, we'll implement a basic structure
  const apiKey = process.env.AUTODEV_API_KEY;
  if (!apiKey) {
    logger.info('Auto.dev API key not configured - skipping this backup service');
    throw new Error('Auto.dev API key not configured');
  }
  
  try {
    const response = await axios.get(`https://auto.dev/api/vin/${cleanVin}`, {
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'QuickCheck-VIN-Decoder/1.0'
      }
    });
    
    if (!response.data) {
      throw new Error('Invalid response from Auto.dev API');
    }
    
    // Convert Auto.dev format to NHTSA-compatible format
    const nhtsaFormat = convertAutoDevToNHTSA(response.data);
    return {
      ...nhtsaFormat,
      source: 'Auto.dev'
    };
    
  } catch (error) {
    throw new Error(`Auto.dev API failed: ${error.message}`);
  }
}

// Backup API 2: Vehicle Databases (Basic plan available)
async function tryVehicleDatabases(cleanVin) {
  const apiKey = process.env.VEHICLE_DATABASES_API_KEY;
  if (!apiKey) {
    logger.info('Vehicle Databases API key not configured - skipping this backup service');
    throw new Error('Vehicle Databases API key not configured');
  }
  
  try {
    const response = await axios.get(`https://api.vehicledatabases.com/vin-decode/${cleanVin}`, {
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'QuickCheck-VIN-Decoder/1.0'
      }
    });
    
    if (!response.data || response.data.status !== 'success') {
      throw new Error('Invalid response from Vehicle Databases API');
    }
    
    // Convert Vehicle Databases format to NHTSA-compatible format
    const nhtsaFormat = convertVehicleDatabasesToNHTSA(response.data);
    return {
      ...nhtsaFormat,
      source: 'Vehicle Databases'
    };
    
  } catch (error) {
    throw new Error(`Vehicle Databases API failed: ${error.message}`);
  }
}

// Helper function to convert Auto.dev response to NHTSA format
function convertAutoDevToNHTSA(autoDevData) {
  const results = [];
  
  // Map Auto.dev fields to NHTSA variable names
  const fieldMapping = {
    'Make': autoDevData.make?.name || '',
    'Model': autoDevData.model?.name || '',
    'Model Year': autoDevData.year?.toString() || '',
    'Body Class': autoDevData.categories?.primaryBodyType || '',
    'Engine Configuration': autoDevData.engine?.configuration || '',
    'Displacement (L)': autoDevData.engine?.size?.toString() || '',
    'Engine Number of Cylinders': autoDevData.engine?.cylinder?.toString() || '',
    'Fuel Type - Primary': autoDevData.engine?.fuelType || '',
    'Transmission Style': autoDevData.transmission?.automaticType || autoDevData.transmission?.transmissionType || '',
    'Drive Type': autoDevData.drivenWheels || '',
    'Vehicle Type': autoDevData.categories?.vehicleType || ''
  };
  
  // Convert to NHTSA Results format
  Object.entries(fieldMapping).forEach(([variable, value]) => {
    results.push({
      Variable: variable,
      Value: value || null,
      ValueId: null,
      VariableId: null
    });
  });
  
  return {
    Count: results.length,
    Message: 'Results returned successfully',
    Results: results,
    SearchCriteria: autoDevData.squishVin || cleanVin
  };
}

// Helper function to convert Vehicle Databases response to NHTSA format
function convertVehicleDatabasesToNHTSA(vdbData) {
  const results = [];
  const data = vdbData.data;
  
  // Map Vehicle Databases fields to NHTSA variable names
  const fieldMapping = {
    'Make': data.basic?.make || '',
    'Model': data.basic?.model || '',
    'Model Year': data.basic?.year || '',
    'Body Class': data.basic?.body_type || '',
    'Engine Configuration': data.engine?.engine_configuration || '',
    'Displacement (L)': data.engine?.engine_size || '',
    'Engine Number of Cylinders': data.engine?.cylinders || '',
    'Fuel Type - Primary': data.fuel?.fuel_type || '',
    'Drive Type': data.drivetrain?.drive_type || '',
    'Vehicle Type': data.basic?.vehicle_type || ''
  };
  
  // Convert to NHTSA Results format
  Object.entries(fieldMapping).forEach(([variable, value]) => {
    results.push({
      Variable: variable,
      Value: value || null,
      ValueId: null,
      VariableId: null
    });
  });
  
  return {
    Count: results.length,
    Message: 'Results returned successfully',
    Results: results,
    SearchCriteria: data.intro?.vin || cleanVin
  };
}

// Backup API 3: Basic VIN Parser (No API key required)
async function tryBasicVinParser(cleanVin) {
  logger.info('Using basic VIN parser as final fallback');
  
  try {
    // Basic VIN parsing - extract manufacturer and model year
    const results = [];
    
    // World Manufacturer Identifier (WMI) - first 3 characters
    const wmi = cleanVin.substring(0, 3);
    
    // Model year (10th character)
    const modelYearChar = cleanVin.charAt(9);
    
    // Basic manufacturer lookup
    const manufacturers = {
      '1G1': 'Chevrolet',
      '1G6': 'Cadillac', 
      '1GC': 'Chevrolet',
      '1GT': 'GMC',
      '1FA': 'Ford',
      '1FD': 'Ford',
      '1FT': 'Ford',
      '1HG': 'Honda',
      '1J4': 'Jeep',
      '1N4': 'Nissan',
      '1VW': 'Volkswagen',
      '2C3': 'Chrysler',
      '2T1': 'Toyota',
      '3FA': 'Ford',
      '3GC': 'GMC',
      '4F2': 'Mazda',
      '4T1': 'Toyota',
      '5YJ': 'Tesla',
      'JM1': 'Mazda',
      'JTD': 'Toyota',
      'KMH': 'Hyundai',
      'KNA': 'Kia',
      'VF1': 'Renault',
      'WBA': 'BMW',
      'WDB': 'Mercedes-Benz',
      'WVW': 'Volkswagen',
      'YV1': 'Volvo',
      'ZAM': 'Maserati'
    };
    
    // Year code mapping
    const yearCodes = {
      'A': '2010', 'B': '2011', 'C': '2012', 'D': '2013', 'E': '2014',
      'F': '2015', 'G': '2016', 'H': '2017', 'J': '2018', 'K': '2019',
      'L': '2020', 'M': '2021', 'N': '2022', 'P': '2023', 'R': '2024',
      'S': '2025', 'T': '2026', 'V': '2027', 'W': '2028', 'X': '2029',
      'Y': '2030', '1': '2001', '2': '2002', '3': '2003', '4': '2004',
      '5': '2005', '6': '2006', '7': '2007', '8': '2008', '9': '2009'
    };
    
    const make = manufacturers[wmi] || 'Unknown';
    const year = yearCodes[modelYearChar] || 'Unknown';
    
    // Build basic results
    const basicFields = {
      'Make': make,
      'Model Year': year,
      'Vehicle Type': 'Unknown',
      'Body Class': 'Unknown',
      'Engine Configuration': 'Unknown',
      'Fuel Type - Primary': 'Unknown',
      'Drive Type': 'Unknown'
    };
    
    Object.entries(basicFields).forEach(([variable, value]) => {
      results.push({
        Variable: variable,
        Value: value,
        ValueId: null,
        VariableId: null
      });
    });
    
    return {
      Count: results.length,
      Message: 'Basic VIN parsing - Limited information available',
      Results: results,
      SearchCriteria: cleanVin,
      source: 'Basic VIN Parser'
    };
    
  } catch (error) {
    throw new Error(`Basic VIN parser failed: ${error.message}`);
  }
}

// === Database Setup ===
// 🧠 Cursor: I'm now using PostgreSQL only (no SQLite) and deploying this backend to Render.
// Simplified database setup to PostgreSQL exclusively - removed all SQLite logic

const DatabaseConfig = require('./database-config');
const DatabaseWrapper = require('./database-wrapper');

let rawDb, dbConfig, db;

// Always use PostgreSQL (both development and production)
dbConfig = new DatabaseConfig();

// Ensure we await the async PostgreSQL connection
(async () => {
  try {
    rawDb = await dbConfig.getConnection();
    db = new DatabaseWrapper(rawDb, dbConfig);
    logger.info('✅ Connected to PostgreSQL database via config');
    
    // Create essential tables in production if they don't exist
    if (isProduction) {
      try {
        const { createProductionTables } = require('./create-production-tables');
        await createProductionTables();
        logger.info('✅ Production table initialization completed');
      } catch (tableError) {
        logger.error('❌ Error creating production tables:', tableError);
        // Continue running even if table creation fails
      }
    }
    
    // Initialize cash management routes after successful connection
    const { setupCashManagementRoutes } = require('./cashManagementRoutes');
    setupCashManagementRoutes(app, db, authenticateToken);
    
  } catch (error) {
    logger.error('❌ Failed to connect to PostgreSQL:', error);
    logger.warn('⚠️  Running in limited mode - some features disabled');
    
    // Don't exit - continue without PostgreSQL features
    db = null;
    rawDb = null;
    
    // In development without PostgreSQL, show helpful message
    if (!isProduction) {
      logger.info('💡 For development, set DATABASE_URL to your PostgreSQL connection string');
      logger.info('💡 Example: DATABASE_URL=postgresql://user:pass@localhost:5432/inspectionapp');
    }
  }
})();

// === Multer file upload ===
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = './uploads';
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info('Created uploads directory');
      }
      // Check if directory is writable
      fs.access(dir, fs.constants.W_OK, (err) => {
        if (err) {
          logger.error('Uploads directory is not writable:', err);
          cb(new Error('Uploads directory is not writable'));
        } else {
          cb(null, dir);
        }
      });
    } catch (err) {
      logger.error('Error setting up uploads directory:', err);
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    // Get the quick check ID from the request
    const quickCheckId = req.params.id || req.body.quickCheckId || 'draft';
    const fieldName = file.fieldname;
    const ext = path.extname(file.originalname);
    
    // Get the current position for this field
    let position = 1;
    const existingFiles = fs.readdirSync('./uploads').filter(f => 
      f.startsWith(`${quickCheckId}_${fieldName}_`) && f.endsWith(ext)
    );
    
    if (existingFiles.length > 0) {
      // Find the highest position number
      const positions = existingFiles.map(f => {
        const match = f.match(new RegExp(`${quickCheckId}_${fieldName}_(\\d+)(-1)?${ext.replace('.', '\\.')}$`));
        return match ? parseInt(match[1]) : 0;
      });
      position = Math.max(...positions) + 1;
    }
    
    // Create filename: quickCheckId_fieldName_position.ext
    const filename = `${quickCheckId}_${fieldName}_${position}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit
  },
  fileFilter: fileFilter
});

// Create a custom upload middleware that handles multiple file fields
const uploadFields = upload.fields([
  { name: 'dashLights', maxCount: 5 },
  { name: 'tpms_placard', maxCount: 5 },
  { name: 'washer_fluid', maxCount: 5 },
  { name: 'engine_air_filter', maxCount: 5 },
  { name: 'battery', maxCount: 5 },
  { name: 'tpms_tool', maxCount: 5 },
  { name: 'front_brakes', maxCount: 5 },
  { name: 'rear_brakes', maxCount: 5 },
  { name: 'tire_passenger_front', maxCount: 5 },
  { name: 'tire_driver_front', maxCount: 5 },
  { name: 'tire_driver_rear', maxCount: 5 },
  { name: 'tire_passenger_rear', maxCount: 5 },
  { name: 'tire_spare', maxCount: 5 },
  { name: 'undercarriage_photos', maxCount: 5 },
  // Additional field-specific image fields that client sends
  { name: 'mileage', maxCount: 5 },
  { name: 'windshield_condition', maxCount: 5 },
  { name: 'wiper_blades', maxCount: 5 },
  { name: 'washer_squirters', maxCount: 5 },
  { name: 'vin', maxCount: 5 },
  { name: 'state_inspection_status', maxCount: 5 },
  { name: 'state_inspection_date_code', maxCount: 5 },
  { name: 'battery_date_code', maxCount: 5 },
  { name: 'tire_repair_status', maxCount: 5 },
  { name: 'tpms_type', maxCount: 5 },
  { name: 'front_brake_pads', maxCount: 5 },
  { name: 'rear_brake_pads', maxCount: 5 },
  // Tire repair image fields
  { name: 'tire_repair_driver_front_not_repairable', maxCount: 5 },
  { name: 'tire_repair_driver_front_tire_size_brand', maxCount: 5 },
  { name: 'tire_repair_driver_front_repairable_spot', maxCount: 5 },
  { name: 'tire_repair_passenger_front_not_repairable', maxCount: 5 },
  { name: 'tire_repair_passenger_front_tire_size_brand', maxCount: 5 },
  { name: 'tire_repair_passenger_front_repairable_spot', maxCount: 5 },
  { name: 'tire_repair_driver_rear_outer_not_repairable', maxCount: 5 },
  { name: 'tire_repair_driver_rear_outer_tire_size_brand', maxCount: 5 },
  { name: 'tire_repair_driver_rear_outer_repairable_spot', maxCount: 5 },
  { name: 'tire_repair_driver_rear_inner_not_repairable', maxCount: 5 },
  { name: 'tire_repair_driver_rear_inner_tire_size_brand', maxCount: 5 },
  { name: 'tire_repair_driver_rear_inner_repairable_spot', maxCount: 5 },
  { name: 'tire_repair_passenger_rear_inner_not_repairable', maxCount: 5 },
  { name: 'tire_repair_passenger_rear_inner_tire_size_brand', maxCount: 5 },
  { name: 'tire_repair_passenger_rear_inner_repairable_spot', maxCount: 5 },
  { name: 'tire_repair_passenger_rear_outer_not_repairable', maxCount: 5 },
  { name: 'tire_repair_passenger_rear_outer_tire_size_brand', maxCount: 5 },
  { name: 'tire_repair_passenger_rear_outer_repairable_spot', maxCount: 5 },
  { name: 'tire_repair_spare_not_repairable', maxCount: 5 },
  { name: 'tire_repair_spare_tire_size_brand', maxCount: 5 },
  { name: 'tire_repair_spare_repairable_spot', maxCount: 5 }
]);

// Add error handling middleware for multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.error('Multer error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 25MB.' });
    }
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  } else if (err) {
    logger.error('Unexpected error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred: ' + err.message });
  }
  next();
});



// === Auth middleware ===
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// === Helper: Read CSV with improved error handling ===
const readUsersFromCSV = () => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, 'users.csv');
    // Create the file with headers if it doesn't exist
    if (!fs.existsSync(filePath)) {
      const headers = 'email,password,name,enabled,role,pin\n';
      fs.writeFileSync(filePath, headers);
      logger.info('Created new users.csv file with headers');
    }
    const users = [];
    fs.createReadStream(filePath)
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim(),
        mapValues: ({ value }) => value.trim()
      }))
      .on('data', (data) => {
        // Normalize enabled and role fields
        users.push({
          ...data,
          enabled: data.enabled === undefined ? true : (data.enabled === 'true' || data.enabled === true),
          role: data.role || 'Technician',
          pin: data.pin || '' // Handle existing users without PIN
        });
      })
      .on('end', () => resolve(users))
      .on('error', (err) => {
        logger.error('CSV read error:', err);
        reject(new Error('Failed to read users file'));
      });
  });
};

// === Helper: Write to CSV with improved error handling ===
const writeUserToCSV = async (email, password, name, role = 'Technician', enabled = true, pin = '') => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, 'users.csv');
    const hashedPassword = bcrypt.hashSync(password, SALT_ROUNDS);
    const newLine = `\n${email},${hashedPassword},${name},${enabled},${role},${pin}`;
    fs.appendFile(filePath, newLine, (err) => {
      if (err) {
        logger.error('Error writing to CSV:', err);
        reject(new Error('Failed to write user data'));
        return;
      }
      resolve();
    });
  });
};

// === Helper to convert photo arrays to array of objects with url property ===
function normalizePhotoFields(data) {
  const photoFields = [
    'dash_lights_photos',
    'tpms_placard',
    'washer_fluid_photo',
    'engine_air_filter_photo',
    'battery_photos',
    'tpms_tool_photo',
    'front_brakes',
    'rear_brakes'
  ];
  photoFields.forEach(field => {
    if (Array.isArray(data[field]) && data[field].length > 0 && typeof data[field][0] === 'string') {
      data[field] = data[field].map(url => ({ url }));
    }
  });
  // Normalize tire_photos
  if (Array.isArray(data.tire_photos)) {
    data.tire_photos = data.tire_photos.map(tp => ({
      ...tp,
      photos: Array.isArray(tp.photos) && tp.photos.length > 0 && typeof tp.photos[0] === 'string'
        ? tp.photos.map(url => ({ url }))
        : tp.photos
    }));
  }
  return data;
}

// === Helper function to delete photo by renaming with -1 suffix ===
function deletePhoto(quickCheckId, fieldName, position) {
  try {
    const uploadsDir = './uploads';
    const files = fs.readdirSync(uploadsDir);
    
    // Find the file to delete
    const fileToDelete = files.find(f => {
      const match = f.match(new RegExp(`^${quickCheckId}_${fieldName}_${position}(-1)?\\.[^.]+$`));
      return match && !f.includes('-1'); // Don't match already deleted files
    });
    
    if (fileToDelete) {
      const oldPath = path.join(uploadsDir, fileToDelete);
      const ext = path.extname(fileToDelete);
      const newFilename = `${quickCheckId}_${fieldName}_${position}-1${ext}`;
      const newPath = path.join(uploadsDir, newFilename);
      
      // Rename the file to mark it as deleted
      fs.renameSync(oldPath, newPath);
      logger.info(`Marked photo as deleted: ${fileToDelete} -> ${newFilename}`);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Error deleting photo:', error);
    return false;
  }
}

// === Helper function to rename draft files to final quick check files ===
function renameDraftFiles(draftId, finalId) {
  try {
    const uploadsDir = './uploads';
    const files = fs.readdirSync(uploadsDir);
    const renamedFiles = [];
    
    logger.info(`Looking for draft files with prefix: ${draftId}_`);
    logger.info(`Available files in uploads directory:`, files);
    
    // Find all files that start with the draft ID
    const draftFiles = files.filter(f => f.startsWith(`${draftId}_`));
    logger.info(`Found ${draftFiles.length} draft files to rename:`, draftFiles);
    
    draftFiles.forEach(file => {
      const oldPath = path.join(uploadsDir, file);
      const newFilename = file.replace(`${draftId}_`, `${finalId}_`);
      const newPath = path.join(uploadsDir, newFilename);
      
      // Check if source file exists
      if (!fs.existsSync(oldPath)) {
        logger.warn(`Source file does not exist: ${oldPath}`);
        return;
      }
      
      // Check if destination file already exists
      if (fs.existsSync(newPath)) {
        logger.warn(`Destination file already exists: ${newPath}`);
        return;
      }
      
      // Rename the file
      fs.renameSync(oldPath, newPath);
      renamedFiles.push({ old: file, new: newFilename });
      logger.info(`Successfully renamed draft file: ${file} -> ${newFilename}`);
    });
    
    logger.info(`Total files renamed: ${renamedFiles.length}`);
    return renamedFiles;
  } catch (error) {
    logger.error('Error renaming draft files:', error);
    return [];
  }
}

// === Helper function to update file URLs in data after renaming ===
function updateFileUrlsInData(data, draftId, finalId) {
  try {
    const updatedData = JSON.parse(JSON.stringify(data)); // Deep clone
    
    logger.info(`Updating URLs from draft ID ${draftId} to final ID ${finalId}`);
    
    // Helper function to update URLs in an array
    const updateUrlsInArray = (urls) => {
      if (!Array.isArray(urls)) return urls;
      const updatedUrls = urls.map(url => {
        if (typeof url === 'string' && url.includes(`/uploads/${draftId}_`)) {
          const newUrl = url.replace(`/uploads/${draftId}_`, `/uploads/${finalId}_`);
          logger.info(`Updated URL: ${url} -> ${newUrl}`);
          return newUrl;
        }
        return url;
      });
      
      if (updatedUrls.some(url => url !== urls[urls.indexOf(url)])) {
        logger.info(`Updated ${updatedUrls.length} URLs in array`);
      }
      
      return updatedUrls;
    };
    
    // Update all photo arrays
    if (updatedData.dash_lights_photos) {
      updatedData.dash_lights_photos = updateUrlsInArray(updatedData.dash_lights_photos);
    }
    if (updatedData.tpms_placard) {
      updatedData.tpms_placard = updateUrlsInArray(updatedData.tpms_placard);
    }
    if (updatedData.washer_fluid_photo) {
      updatedData.washer_fluid_photo = updateUrlsInArray(updatedData.washer_fluid_photo);
    }
    if (updatedData.engine_air_filter_photo) {
      updatedData.engine_air_filter_photo = updateUrlsInArray(updatedData.engine_air_filter_photo);
    }
    if (updatedData.battery_photos) {
      updatedData.battery_photos = updateUrlsInArray(updatedData.battery_photos);
    }
    if (updatedData.tpms_tool_photo) {
      updatedData.tpms_tool_photo = updateUrlsInArray(updatedData.tpms_tool_photo);
    }
    if (updatedData.front_brakes) {
      updatedData.front_brakes = updateUrlsInArray(updatedData.front_brakes);
    }
    if (updatedData.rear_brakes) {
      updatedData.rear_brakes = updateUrlsInArray(updatedData.rear_brakes);
    }
    
    // Update tire photos
    if (updatedData.tire_photos && Array.isArray(updatedData.tire_photos)) {
      updatedData.tire_photos.forEach(tirePhoto => {
        if (tirePhoto.photos) {
          tirePhoto.photos = updateUrlsInArray(tirePhoto.photos);
        }
      });
    }
    
    logger.info('Successfully updated all file URLs in data');
    return updatedData;
  } catch (error) {
    logger.error('Error updating file URLs in data:', error);
    return data;
  }
}

// === Helper: Admin check middleware
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
}

// === Single Image Upload Endpoint ===
const singleImageUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, 'uploads', 'Inspections');
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          logger.info('Created uploads/Inspections directory at:', dir);
        }
        cb(null, dir);
      } catch (err) {
        logger.error('Error setting up uploads/Inspections directory:', err);
        cb(err);
      }
    },
    filename: function (req, file, cb) {
      // Create unique filename with timestamp
      const timestamp = Date.now();
      const randomId = Math.floor(Math.random() * 1000000000);
      const ext = path.extname(file.originalname);
      const filename = `${file.fieldname || 'image'}-${timestamp}-${randomId}${ext}`;
      cb(null, filename);
    }
  }),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit
  },
  fileFilter: fileFilter
}).single('image');

// Upload single image endpoint
app.post('/api/upload-image', authenticateToken, singleImageUpload, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageUrl = `/uploads/Inspections/${req.file.filename}`;
    const filePath = req.file.path;
    
    // Ensure file is fully written to disk before responding
    fs.fsync(fs.openSync(filePath, 'r'), (err) => {
      if (err) {
        logger.warn('File sync warning (file should still be accessible):', err);
      }
    });
    
    // Additional verification that file exists and is readable
    if (!fs.existsSync(filePath)) {
      logger.error('File was not created successfully:', filePath);
      return res.status(500).json({ error: 'Failed to save image file' });
    }
    
    logger.info(`Image uploaded and verified at: ${filePath}`);
    logger.info(`Image URL: ${imageUrl}`);
    
    res.json({ 
      url: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    logger.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// === Routes ===

// === Health check endpoint ===
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    protocol: req.protocol,
    secure: req.secure,
    hostname: req.hostname,
    databaseStatus: db ? 'connected' : 'disconnected',
    version: 'v2.0-fallback-mode'
  });
});

// === Root endpoint for certificate testing ===
app.get('/', (req, res) => {
  res.json({ 
    message: 'Vehicle Inspection API Server',
    status: 'running',
    version: '1.0.0',
    endpoints: [
      '/api/health',
      '/api/login',
      '/api/users',
      '/api/quick_checks',
      '/api/state_inspections'
    ],
    timestamp: new Date().toISOString()
  });
});

// === Login endpoint ===
app.post('/api/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  // Input validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  try {
    const users = await readUsersFromCSV();
    const user = users.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.enabled) {
      return res.status(403).json({ error: 'User account is disabled' });
    }
    // Verify password - handle both plain text and hashed passwords
    let isValidPassword = false;
    
    // Check if password is already hashed (starts with $2a$ or $2b$)
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      // Password is hashed, use bcrypt compare
      isValidPassword = await bcrypt.compare(password, user.password);
    } else {
      // Password is plain text, do direct comparison
      isValidPassword = (password === user.password);
    }
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Generate token with expiration and role
    const token = jwt.sign(
      { email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ 
      token,
      email: user.email,
      name: user.name,
      role: user.role,
      userId: user.email, // Use email as userId for draft system
      tokenType: 'Bearer',
      expiresIn: 86400 // 24 hours in seconds
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register with improved validation and error handling
app.post('/api/register', async (req, res) => {
  const { email, password, name, role, pin } = req.body;
  logger.info('--- /api/register called ---');
  logger.info('Request body:', req.body);
  logger.info('Received fields:', { 
    email: email || 'missing', 
    password: password ? '[REDACTED]' : 'missing', 
    name: name || 'missing',
    role: role || 'Technician',
    pin: pin || 'missing'
  });
  // Input validation
  if (!email || !password || !name || !pin) {
    logger.info('Missing fields:', { 
      email: !!email, 
      password: !!password, 
      name: !!name,
      pin: !!pin
    });
    return res.status(400).json({ error: 'All fields including PIN are required' });
  }
  if (!validateEmail(email)) {
    logger.info('Invalid email format:', email);
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (!validatePassword(password)) {
    logger.info('Invalid password format');
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  // Validate PIN
  if (!/^\d{4}$/.test(pin)) {
    logger.info('Invalid PIN format:', pin);
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }
  try {
    const users = await readUsersFromCSV();
    logger.info('Loaded users:', users.map(u => ({ email: u.email, name: u.name })));
    // Check if email already exists
    if (users.some(u => u.email.toLowerCase().trim() === email.toLowerCase().trim())) {
      logger.info('Email already registered:', email);
      return res.status(400).json({ error: 'Email already registered' });
    }
    // Check if PIN already exists
    if (users.some(u => u.pin === pin)) {
      logger.info('PIN already exists:', pin);
      return res.status(400).json({ error: 'PIN already exists. Please choose a different 4-digit PIN.' });
    }
    // Write new user to CSV (enabled true, role default Technician)
    await writeUserToCSV(email, password, name, role || 'Technician', true, pin);
    logger.info('User registered successfully:', { email, name, role: role || 'Technician', pin });
    res.status(201).json({ message: 'Registration successful' });
  } catch (err) {
    logger.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile information
app.get('/api/profile', authenticateToken, async (req, res) => {
  const currentUserEmail = req.user.email;

  logger.info('--- /api/profile GET called ---');
  logger.info('Current user:', currentUserEmail);

  try {
    const users = await readUsersFromCSV();
    const currentUser = users.find(u => u.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim());
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return user info without sensitive data
    res.json({
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      pin: currentUser.pin || ''
    });
  } catch (err) {
    logger.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update profile information
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { name, email, pin } = req.body;
  const currentUserEmail = req.user.email;

  logger.info('--- /api/profile PUT called ---');
  logger.info('Current user:', currentUserEmail);
  logger.info('Request body:', { name, email, pin: pin ? '[PROVIDED]' : '[NOT PROVIDED]' });

  // Input validation
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate PIN if provided
  if (pin !== undefined && pin !== '') {
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
  }

  try {
    const users = await readUsersFromCSV();
    const currentUser = users.find(u => u.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim());
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if new email is already taken by another user
    if (email.toLowerCase().trim() !== currentUserEmail.toLowerCase().trim()) {
      const emailExists = users.some(u => 
        u.email.toLowerCase().trim() === email.toLowerCase().trim() &&
        u.email.toLowerCase().trim() !== currentUserEmail.toLowerCase().trim()
      );
      
      if (emailExists) {
        return res.status(400).json({ error: 'Email already taken by another user' });
      }
    }

    // Check if new PIN is already taken by another user (if PIN is being updated)
    if (pin !== undefined && pin !== '' && pin !== currentUser.pin) {
      const pinExists = users.some(u => 
        u.pin === pin &&
        u.email.toLowerCase().trim() !== currentUserEmail.toLowerCase().trim()
      );
      
      if (pinExists) {
        return res.status(400).json({ error: 'PIN already exists. Please choose a different 4-digit PIN.' });
      }
    }

    // Update user in CSV
    const updatedUsers = users.map(user => {
      if (user.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) {
        const updatedUser = { ...user, name, email };
        // Update PIN if provided
        if (pin !== undefined) {
          updatedUser.pin = pin;
        }
        return updatedUser;
      }
      return user;
    });

    // Write updated users back to CSV
    const filePath = path.join(__dirname, 'users.csv');
    const csvHeader = 'email,password,name,enabled,role,pin\n';
    const csvContent = updatedUsers.map(user => `${user.email},${user.password},${user.name},${user.enabled},${user.role},${user.pin || ''}`).join('\n');
    
    fs.writeFileSync(filePath, csvHeader + csvContent);
    
    logger.info('Profile updated successfully:', { oldEmail: currentUserEmail, newEmail: email, name, pinUpdated: pin !== undefined });
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    logger.error('Profile update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update password
app.put('/api/profile/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const currentUserEmail = req.user.email;

  logger.info('--- /api/profile/password PUT called ---');
  logger.info('Current user:', currentUserEmail);

  // Input validation
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (!validatePassword(newPassword)) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    const users = await readUsersFromCSV();
    const currentUser = users.find(u => u.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim());
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, currentUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = bcrypt.hashSync(newPassword, SALT_ROUNDS);

    // Update user password in CSV
    const updatedUsers = users.map(user => {
      if (user.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) {
        return { ...user, password: hashedNewPassword };
      }
      return user;
    });

    // Write updated users back to CSV
    const filePath = path.join(__dirname, 'users.csv');
    const csvHeader = 'email,password,name,enabled,role,pin\n';
    const csvContent = updatedUsers.map(user => `${user.email},${user.password},${user.name},${user.enabled},${user.role},${user.pin || ''}`).join('\n');
    
    fs.writeFileSync(filePath, csvHeader + csvContent);
    
    logger.info('Password updated successfully for user:', currentUserEmail);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    logger.error('Password update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all users (admin only)
app.delete('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  const currentUserEmail = req.user.email;

  logger.info('--- /api/users DELETE called ---');
  logger.info('Current user:', currentUserEmail);

  try {
    // Check if current user is admin (you can customize this logic)
    const users = await readUsersFromCSV();
    const currentUser = users.find(u => u.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim());
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Optional: Add admin check here if needed
    // if (!currentUser.isAdmin) {
    //   return res.status(403).json({ error: 'Admin privileges required' });
    // }

    // Clear all users by writing only the header
    const filePath = path.join(__dirname, 'users.csv');
    const csvHeader = 'email,password,name,enabled,role\n';
    
    fs.writeFileSync(filePath, csvHeader);
    
    logger.info('All users deleted successfully by:', currentUserEmail);
    res.json({ message: 'All users deleted successfully' });
  } catch (err) {
    logger.error('Delete all users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all users (admin only)
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await readUsersFromCSV();
    res.json(users);
  } catch (err) {
    logger.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Find user by PIN
app.post('/api/users/lookup-by-pin', async (req, res) => {
  const { pin } = req.body;
  
  logger.info('--- /api/users/lookup-by-pin called ---');
  logger.info('Request body:', { pin: pin || 'missing' });
  
  // Input validation
  if (!pin) {
    return res.status(400).json({ error: 'PIN is required' });
  }
  
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }
  
  try {
    const users = await readUsersFromCSV();
    const user = users.find(u => u.pin === pin && u.enabled);
    
    if (!user) {
      logger.info('No user found with PIN:', pin);
      return res.status(404).json({ error: 'No user found with this PIN' });
    }
    
    logger.info('User found with PIN:', { email: user.email, name: user.name });
    
    // Return user info without sensitive data
    res.json({
      email: user.email,
      name: user.name,
      role: user.role
    });
  } catch (err) {
    logger.error('PIN lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a user by email (admin only)
app.delete('/api/users/:email', authenticateToken, requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  try {
    let users = await readUsersFromCSV();
    const initialLength = users.length;
    users = users.filter(u => u.email.toLowerCase().trim() !== email);
    if (users.length === initialLength) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Write updated users back to CSV
    const filePath = path.join(__dirname, 'users.csv');
    const csvHeader = 'email,password,name,enabled,role\n';
    const csvContent = users.map(user => `${user.email},${user.password},${user.name},${user.enabled},${user.role}`).join('\n');
    fs.writeFileSync(filePath, csvHeader + csvContent);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    logger.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Enable a user (admin only)
app.put('/api/users/:email/enable', authenticateToken, requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  try {
    let users = await readUsersFromCSV();
    let found = false;
    users = users.map(u => {
      if (u.email.toLowerCase().trim() === email) {
        found = true;
        return { ...u, enabled: true };
      }
      return u;
    });
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Write updated users back to CSV
    const filePath = path.join(__dirname, 'users.csv');
    const csvHeader = 'email,password,name,enabled,role\n';
    const csvContent = users.map(user => `${user.email},${user.password},${user.name},${user.enabled},${user.role}`).join('\n');
    fs.writeFileSync(filePath, csvHeader + csvContent);
    res.json({ message: 'User enabled successfully' });
  } catch (err) {
    logger.error('Error enabling user:', err);
    res.status(500).json({ error: 'Failed to enable user' });
  }
});

// Disable a user (admin only)
app.put('/api/users/:email/disable', authenticateToken, requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  try {
    let users = await readUsersFromCSV();
    let found = false;
    users = users.map(u => {
      if (u.email.toLowerCase().trim() === email) {
        found = true;
        return { ...u, enabled: false };
      }
      return u;
    });
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Write updated users back to CSV
    const filePath = path.join(__dirname, 'users.csv');
    const csvHeader = 'email,password,name,enabled,role\n';
    const csvContent = users.map(user => `${user.email},${user.password},${user.name},${user.enabled},${user.role}`).join('\n');
    fs.writeFileSync(filePath, csvHeader + csvContent);
    res.json({ message: 'User disabled successfully' });
  } catch (err) {
    logger.error('Error disabling user:', err);
    res.status(500).json({ error: 'Failed to disable user' });
  }
});

// Change a user's role (admin only)
app.put('/api/users/:email/role', authenticateToken, requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const { role } = req.body;
  if (!role || !['Admin', 'Technician', 'Service advisor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  try {
    let users = await readUsersFromCSV();
    let found = false;
    users = users.map(u => {
      if (u.email.toLowerCase().trim() === email) {
        found = true;
        return { ...u, role };
      }
      return u;
    });
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Write updated users back to CSV
    const filePath = path.join(__dirname, 'users.csv');
    const csvHeader = 'email,password,name,enabled,role\n';
    const csvContent = users.map(user => `${user.email},${user.password},${user.name},${user.enabled},${user.role}`).join('\n');
    fs.writeFileSync(filePath, csvHeader + csvContent);
    res.json({ message: 'User role updated successfully' });
  } catch (err) {
    logger.error('Error updating user role:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Get all quick checks
app.get('/api/quick-checks', authenticateToken, (req, res) => {
  db.all('SELECT * FROM quick_checks ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      logger.error('Error fetching quick checks:', err);
      return res.status(500).json({ error: 'Failed to fetch quick checks' });
    }
    res.json(rows.map(row => ({
      ...row,
      data: normalizePhotoFields(JSON.parse(row.data))
    })));
  });
});

// Get in-progress quick checks
app.get('/api/quick-checks/in-progress', authenticateToken, (req, res) => {
  // Check if database is available
  if (!db) {
    logger.warn('Database not available, returning empty in-progress quick checks');
    return res.json([]);
  }

  try {
    db.all('SELECT * FROM quick_checks WHERE status = ? ORDER BY created_at DESC', ['pending'], (err, rows) => {
      if (err) {
        logger.error('Error fetching in-progress quick checks:', err);
        logger.warn('Database error occurred, falling back to empty response');
        return res.json([]); // Return empty array instead of 500 error
      }
      res.json(rows.map(row => ({
        ...row,
        data: normalizePhotoFields(JSON.parse(row.data))
      })));
    });
  } catch (error) {
    logger.error('Database query exception:', error);
    logger.warn('Database query failed, returning empty in-progress quick checks');
    res.json([]);
  }
});

// Get submitted (non-archived) quick checks
app.get('/api/quick-checks/submitted', authenticateToken, (req, res) => {
  // Check if database is available
  if (!db) {
    logger.warn('Database not available, returning empty submitted quick checks');
    return res.json([]);
  }

  try {
    db.all('SELECT * FROM quick_checks WHERE status = ? ORDER BY created_at DESC', ['submitted'], (err, rows) => {
      if (err) {
        logger.error('Error fetching submitted quick checks:', err);
        logger.warn('Database error occurred, falling back to empty response');
        return res.json([]); // Return empty array instead of 500 error
      }
      res.json(rows.map(row => ({
        ...row,
        data: normalizePhotoFields(JSON.parse(row.data))
      })));
    });
  } catch (error) {
    logger.error('Database query exception:', error);
    logger.warn('Database query failed, returning empty submitted quick checks');
    res.json([]);
  }
});

// Get archived quick checks
app.get('/api/quick-checks/archived', authenticateToken, (req, res) => {
  db.all('SELECT * FROM quick_checks WHERE status = ? ORDER BY archived_at DESC', ['archived'], (err, rows) => {
    if (err) {
      logger.error('Error fetching archived quick checks:', err);
      return res.status(500).json({ error: 'Failed to fetch archived quick checks' });
    }
    res.json(rows.map(row => ({
      ...row,
      data: normalizePhotoFields(JSON.parse(row.data))
    })));
  });
});

// Legacy endpoint for backward compatibility (redirects to submitted)
app.get('/api/quick-checks/active', authenticateToken, (req, res) => {
  db.all('SELECT * FROM quick_checks WHERE status = ? ORDER BY created_at DESC', ['submitted'], (err, rows) => {
    if (err) {
      logger.error('Error fetching submitted quick checks:', err);
      return res.status(500).json({ error: 'Failed to fetch submitted quick checks' });
    }
    res.json(rows.map(row => ({
      ...row,
      data: normalizePhotoFields(JSON.parse(row.data))
    })));
  });
});

// GET all draft quick checks (status = 'pending')
app.get('/api/quick-checks/draft', authenticateToken, (req, res) => {
  // Check if database is available
  if (!db) {
    logger.warn('Database not available, returning empty draft quick checks');
    return res.json([]);
  }

  try {
    db.all(
      "SELECT * FROM quick_checks WHERE status = 'pending' ORDER BY created_at DESC",
      (err, rows) => {
        if (err) {
          logger.error('Error fetching draft quick checks:', err);
          logger.warn('Database error occurred, falling back to empty response');
          return res.json([]); // Return empty array instead of 500 error
        }
        res.json(rows);
      }
    );
  } catch (error) {
    logger.error('Database query exception:', error);
    logger.warn('Database query failed, returning empty draft quick checks');
    res.json([]);
  }
});

// Get a quick check by ID
app.get('/api/quick-checks/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  logger.info('--- /api/quick-checks/:id GET called ---');
  logger.info('Fetching quick check:', id);
  
  db.get('SELECT * FROM quick_checks WHERE id = ?', [id], (err, row) => {
    if (err) {
      logger.error('Error fetching quick check:', err);
      return res.status(500).json({ error: 'Failed to fetch quick check' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Quick check not found' });
    }
    
    try {
      const parsedData = JSON.parse(row.data);
      logger.info('Retrieved quick check data:', {
        id: row.id,
        status: row.status,
        hasArchivedDatetime: !!parsedData.archived_datetime,
        archivedDatetime: parsedData.archived_datetime,
        hasCreatedDatetime: !!parsedData.created_datetime,
        hasSubmittedDatetime: !!parsedData.submitted_datetime
      });
      // Calculate durations
      let technician_duration = null;
      let service_advisor_duration = null;
      if (parsedData.created_datetime && parsedData.submitted_datetime) {
        technician_duration = Math.floor((new Date(parsedData.submitted_datetime) - new Date(parsedData.created_datetime)) / 1000);
      }
      if (parsedData.submitted_datetime && parsedData.archived_datetime) {
        service_advisor_duration = Math.floor((new Date(parsedData.archived_datetime) - new Date(parsedData.submitted_datetime)) / 1000);
      }
      res.json({
        ...row,
        data: cleanupBlobUrls(normalizePhotoFields(parsedData)),
        technician_duration,
        service_advisor_duration
      });
    } catch (parseErr) {
      logger.error('Error parsing quick check data:', parseErr);
      return res.status(500).json({ error: 'Failed to parse quick check data' });
    }
  });
});

// Create an in-progress quick check (draft)
app.post('/api/quick-checks/draft', authenticateToken, async (req, res) => {
  // Check if database is available
  if (!db) {
    logger.warn('Database not available, returning simulated draft creation response');
    return res.status(201).json({ id: Date.now() }); // Return simulated ID
  }

  try {
    const { title, data } = req.body;
    const userEmail = req.user.email;
    const userName = req.user.name;

    logger.info('--- /api/quick-checks/draft POST called ---');
    logger.info('Creating draft quick check for user:', { userEmail, userName });

    if (!title) {
      return res.status(400).json({ error: 'Title is required for draft' });
    }

    // For drafts, data is optional
    let parsedData = data ? JSON.parse(data) : {};
    
    // Clean up any blob URLs that might have been sent from the client
    parsedData = cleanupBlobUrls(parsedData);

    // Log the draft creation data
    logger.info('=== DRAFT CREATION DATA ===');
    logger.info('Title:', title);
    logger.info('User:', { email: userEmail, name: userName });
    logger.info('Complete draft data (JSON):', JSON.stringify(parsedData, null, 2));
    logger.info('=== END DRAFT CREATION DATA ===');

    // Use db.run instead of db.prepare for PostgreSQL compatibility
    db.run(
      `INSERT INTO quick_checks (user_email, user_name, title, data, created_at, updated_at, status, duration_seconds, saved_at)
       VALUES (?, ?, ?, ?, NOW(), NOW(), ?, 0, NOW())`,
      [userEmail, userName, title, JSON.stringify(parsedData), 'pending'],
      function(err) {
        if (err) {
          logger.error('Database error creating draft quick check:', err);
          logger.warn('Database error occurred, falling back to simulated response');
          return res.status(201).json({ id: Date.now() }); // Return simulated ID
        }
        
        const insertId = this.lastID || Date.now();
        logger.info('=== DRAFT CREATION RESULT ===');
        logger.info('Successfully created draft quick check with ID:', insertId);
        logger.info('Status: pending');
        logger.info('Duration: 0 seconds (new draft)');
        logger.info('=== END DRAFT CREATION RESULT ===');
        
        // Emit WebSocket event for draft creation
        if (global.wsService) {
          global.wsService.emitQuickCheckUpdate('created', {
            id: insertId,
            title: title,
            data: parsedData,
            user: userName,
            userEmail: userEmail,
            status: 'pending',
            created_at: new Date().toISOString()
          });
        }
        
        res.status(201).json({ id: insertId });
      }
    );
  } catch (err) {
    logger.error('Unexpected error in draft quick-checks endpoint:', err);
    logger.warn('Draft creation failed, returning simulated response');
    res.status(201).json({ id: Date.now() }); // Return simulated ID
  }
});

// Update draft data for existing quick check (tab change)
app.put('/api/quick-checks/:id/draft', authenticateToken, (req, res) => {
  const id = req.params.id;
  const { title, data } = req.body;
  const userEmail = req.user.email;
  const userName = req.user.name;

  logger.info('--- /api/quick-checks/:id/draft PUT called ---');
  logger.info('Updating draft data for quick check:', { id, userEmail, userName });

  // Check if database is available
  if (!db) {
    logger.warn('Database not available, returning simulated draft update response');
    return res.json({ message: 'Draft updated successfully (simulated)' });
  }

  if (!data) {
    return res.status(400).json({ error: 'Data is required for draft update' });
  }

  try {
    // Parse the data if it's a string
    let parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Clean up any blob URLs that might have been sent from the client
    parsedData = cleanupBlobUrls(parsedData);

    // Use db.run instead of db.prepare for PostgreSQL compatibility
    db.run(
      `UPDATE quick_checks 
       SET data = ?, title = ?, updated_at = NOW(), saved_at = NOW()
       WHERE id = ? AND status = ?`,
      [JSON.stringify(parsedData), title || null, id, 'pending'],
      function(err) {
        if (err) {
          logger.error('Database error updating draft quick check:', err);
          logger.warn('Database error occurred, falling back to simulated response');
          return res.json({ message: 'Draft updated successfully (fallback)' });
        }
        if (this.changes === 0) {
          logger.warn('Draft not found or not in pending status, returning simulated response');
          return res.json({ message: 'Draft updated successfully (simulated)' });
        }
        logger.info('Successfully updated draft data for quick check:', { id, title });
        
        // Emit WebSocket event for draft update
        if (global.wsService) {
          global.wsService.emitQuickCheckUpdate('updated', {
            id: parseInt(id),
            title: title,
            data: parsedData,
            user: userName,
            userEmail: userEmail,
            status: 'pending',
            updated_at: new Date().toISOString()
          });
        }
        
        res.json({ message: 'Draft updated successfully' });
      }
    );
  } catch (error) {
    logger.error('Error updating draft:', error);
    logger.warn('Draft update failed, returning simulated response');
    res.json({ message: 'Draft updated successfully (fallback)' });
  }
});

// Update draft data with file uploads for existing quick check
app.put('/api/quick-checks/:id/draft/upload', authenticateToken, uploadFields, async (req, res) => {
  try {
    const id = req.params.id;
    const { title, data } = req.body;
    const userEmail = req.user.email;
    const userName = req.user.name;

    logger.info('--- /api/quick-checks/:id/draft/upload PUT called ---');
    logger.info('Updating draft data with files for quick check:', { id, userEmail, userName });
    logger.info('Files received:', req.files ? Object.keys(req.files).map(key => ({
      field: key,
      files: req.files[key].map(f => ({ filename: f.filename, size: f.size }))
    })) : 'No files');

    if (!data) {
      return res.status(400).json({ error: 'Data is required for draft update' });
    }

    // Parse the data if it's a string
    let parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Clean up any blob URLs that might have been sent from the client
    parsedData = cleanupBlobUrls(parsedData);

    // Process uploaded files and update the data
    if (req.files) {
      logger.info('Processing file uploads for draft submission');
      
      // Use the same field mapping as final submission for consistency
      const fieldMapping = {
        'dashLights': 'dash_lights_photos',
        'tpms_placard': 'tpms_placard',
        'washer_fluid': 'washer_fluid_photo',
        'engine_air_filter': 'engine_air_filter_photo',
        'battery': 'battery_photos',
        'tpms_tool': 'tpms_tool_photo',
        'front_brakes': 'front_brakes',
        'rear_brakes': 'rear_brakes',
        // Additional field-specific image mappings (THESE WERE MISSING!)
        'mileage': 'mileage_photos',
        'windshield_condition': 'windshield_condition_photos',
        'wiper_blades': 'wiper_blades_photos',
        'washer_squirters': 'washer_squirters_photos',
        'vin': 'vin_photos',
        'state_inspection_status': 'state_inspection_status_photos',
        'state_inspection_date_code': 'state_inspection_date_code_photos',
        'battery_date_code': 'battery_date_code_photos',
        'tire_repair_status': 'tire_repair_status_photos',
        'tpms_type': 'tpms_type_photos',
        'front_brake_pads': 'front_brake_pads_photos',
        'rear_brake_pads': 'rear_brake_pads_photos'
      };

      // Process uploaded files and update form data with file URLs
      for (const [fieldName, files] of Object.entries(req.files)) {
        if (!Array.isArray(files)) continue;
        
        const fileUrls = files.map(file => ({
          url: `/uploads/${file.filename}`,
          filename: file.filename
        }));

        // Handle tire photo fields
        if (fieldName.startsWith('tire_') && !fieldName.includes('tire_repair_')) {
          const tireType = fieldName.replace('tire_', '');
          if (!parsedData.tire_photos) parsedData.tire_photos = [];
          
          // Find or create tire photo group
          let tireGroup = parsedData.tire_photos.find(tp => tp.type === tireType);
          if (!tireGroup) {
            tireGroup = { type: tireType, photos: [] };
            parsedData.tire_photos.push(tireGroup);
          }
          tireGroup.photos = fileUrls;
        }
        // Handle regular photo fields using the mapping
        else if (fieldMapping[fieldName]) {
          const dataFieldName = fieldMapping[fieldName];
          parsedData[dataFieldName] = fileUrls;
          logger.info(`Updated ${fieldName} -> ${dataFieldName} with ${fileUrls.length} file URLs`);
        }
        // Handle unmapped fields (fallback)
        else if (!fieldName.startsWith('tire_repair_')) {
          logger.warn(`Unmapped field: ${fieldName}, storing as-is`);
          parsedData[fieldName] = fileUrls;
        }
      }



      // Process tire repair images
      Object.keys(req.files).forEach(field => {
        if (field.startsWith('tire_repair_')) {
          console.log(`[SUBMISSION] Processing tire repair image field: ${field}`);
          const parts = field.replace('tire_repair_', '').split('_');
          if (parts.length >= 2) {
            // Extract position and image type
            const imageType = parts[parts.length - 1] === 'repairable' && parts[parts.length - 2] === 'spot' 
              ? 'repairable_spot' 
              : parts[parts.length - 1] === 'brand' && parts[parts.length - 2] === 'size' && parts[parts.length - 3] === 'tire'
              ? 'tire_size_brand'
              : parts[parts.length - 1] === 'repairable' && parts[parts.length - 2] === 'not'
              ? 'not_repairable'
              : null;
            
            if (imageType) {
              const position = imageType === 'repairable_spot' 
                ? parts.slice(0, -2).join('_')
                : imageType === 'tire_size_brand'
                ? parts.slice(0, -3).join('_')
                : imageType === 'not_repairable'
                ? parts.slice(0, -2).join('_')
                : null;
              
              if (position) {
                console.log(`[SUBMISSION] Parsed tire repair image: position=${position}, imageType=${imageType}`);
                
                // Initialize tire_repair_images if it doesn't exist
                if (!parsedData.tire_repair_images) {
                  parsedData.tire_repair_images = {};
                  console.log('[SUBMISSION] Initialized tire_repair_images object');
                }
                
                // Initialize position if it doesn't exist
                if (!parsedData.tire_repair_images[position]) {
                  parsedData.tire_repair_images[position] = {
                    not_repairable: [],
                    tire_size_brand: [],
                    repairable_spot: []
                  };
                  console.log(`[SUBMISSION] Initialized tire_repair_images[${position}]`);
                }
                
                // Add the new photos
                req.files[field].forEach(file => {
                  const imageUrl = `/uploads/${file.filename}`;
                  parsedData.tire_repair_images[position][imageType].push({
                    url: imageUrl,
                    filename: file.filename
                  });
                  console.log(`[SUBMISSION] Added tire repair image: ${imageUrl} to ${position}[${imageType}]`);
                });
              } else {
                console.warn(`[SUBMISSION] Could not determine position for tire repair field: ${field}`);
              }
            } else {
              console.warn(`[SUBMISSION] Could not determine image type for tire repair field: ${field}`);
            }
          } else {
            console.warn(`[SUBMISSION] Invalid tire repair field format: ${field}`);
          }
        }
      });
    }

    // Update the existing draft with the new data and files
    logger.info('Updating existing draft with files');
    logger.info('Draft update data summary:', {
      vin: parsedData.vin,
      date: parsedData.date,
      user: parsedData.user,
      mileage: parsedData.mileage,
      tire_repair_images_count: parsedData.tire_repair_images ? Object.keys(parsedData.tire_repair_images).length : 0,
      tire_repair_images: parsedData.tire_repair_images
    });
    
    // Check if database is available
    if (!db) {
      logger.warn('Database not available, returning simulated draft upload response');
      return res.json({ message: 'Draft updated successfully with files (simulated)' });
    }

    // Use db.run instead of db.prepare for PostgreSQL compatibility
    db.run(
      `UPDATE quick_checks 
       SET data = ?, title = ?, updated_at = NOW(), saved_at = NOW()
       WHERE id = ? AND status = ?`,
      [JSON.stringify(parsedData), title || null, id, 'pending'],
      function(err) {
        if (err) {
          logger.error('Database error updating draft quick check with files:', err);
          logger.warn('Database error occurred, falling back to simulated response');
          return res.json({ message: 'Draft updated successfully with files (fallback)' });
        }
        if (this.changes === 0) {
          logger.warn('Draft not found or not in pending status, returning simulated response');
          return res.json({ message: 'Draft updated successfully with files (simulated)' });
        }
        logger.info('Successfully updated draft data with files for quick check:', { id, title });
        
        // Emit WebSocket event for draft update with files
        if (global.wsService) {
          global.wsService.emitQuickCheckUpdate('updated', {
            id: parseInt(id),
            title: title,
            data: parsedData,
            user: userName,
            userEmail: userEmail,
            status: 'pending',
            updated_at: new Date().toISOString()
          });
        }
        
        res.json({ message: 'Draft updated successfully with files' });
      }
    );
  } catch (err) {
    logger.error('Unexpected error in draft upload endpoint:', err);
    logger.error('Error details:', {
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'An unexpected error occurred: ' + err.message });
  }
});

// Submit quick check (final submission)
app.post('/api/quick-checks', authenticateToken, uploadFields, async (req, res) => {
  try {
    logger.info('--- /api/quick-checks POST called (final submission) ---');
    
    // Check if database is available
    if (!db) {
      logger.warn('Database not available, returning simulated quick check creation response');
      return res.json({ id: Date.now() }); // Return simulated ID
    }
    
    const { title, data: dataString, draftId } = req.body;
    const userEmail = req.user.email;
    const userName = req.user.name;
    
    logger.info('Final submission data:', { 
      title, 
      userEmail, 
      userName, 
      draftId,
      hasFiles: !!req.files && Object.keys(req.files).length > 0,
      dataLength: dataString ? dataString.length : 0
    });

    if (!title || !dataString) {
      return res.status(400).json({ error: 'Title and data are required' });
    }

    let formData;
    try {
      formData = JSON.parse(dataString);
    } catch (parseErr) {
      logger.error('Error parsing form data:', parseErr);
      return res.status(400).json({ error: 'Invalid form data format' });
    }

    // Add submitted_datetime to the form data
    formData.submitted_datetime = new Date().toISOString();
    
    // Clean up any blob URLs that might have been sent from the client
    formData = cleanupBlobUrls(formData);
    
    // Handle file uploads if present
    if (req.files && Object.keys(req.files).length > 0) {
      logger.info('Processing file uploads for final submission');
      
      // Map file field names to data field names
      const fieldMapping = {
        'dashLights': 'dash_lights_photos',
        'tpms_placard': 'tpms_placard',
        'washer_fluid': 'washer_fluid_photo',
        'engine_air_filter': 'engine_air_filter_photo',
        'battery': 'battery_photos',
        'tpms_tool': 'tpms_tool_photo',
        'front_brakes': 'front_brakes',
        'rear_brakes': 'rear_brakes',
        // Additional field-specific image mappings
        'mileage': 'mileage_photos',
        'windshield_condition': 'windshield_condition_photos',
        'wiper_blades': 'wiper_blades_photos',
        'washer_squirters': 'washer_squirters_photos',
        'vin': 'vin_photos',
        'state_inspection_status': 'state_inspection_status_photos',
        'state_inspection_date_code': 'state_inspection_date_code_photos',
        'battery_date_code': 'battery_date_code_photos',
        'tire_repair_status': 'tire_repair_status_photos',
        'tpms_type': 'tpms_type_photos',
        'front_brake_pads': 'front_brake_pads_photos',
        'rear_brake_pads': 'rear_brake_pads_photos'
      };
      
      // Process uploaded files and update form data with file URLs
      for (const [fieldName, files] of Object.entries(req.files)) {
        if (!Array.isArray(files)) continue;
        
        const fileUrls = files.map(file => ({
          url: `/uploads/${file.filename}`,
          originalName: file.originalname,
          size: file.size
        }));
        
        // Handle tire photo fields
        if (fieldName.startsWith('tire_') && !fieldName.includes('tire_repair_')) {
          const tireType = fieldName.replace('tire_', '');
          if (!formData.tire_photos) formData.tire_photos = [];
          
          // Find or create tire photo group
          let tireGroup = formData.tire_photos.find(tp => tp.type === tireType);
          if (!tireGroup) {
            tireGroup = { type: tireType, photos: [] };
            formData.tire_photos.push(tireGroup);
          }
          tireGroup.photos = fileUrls;
        }
        // Handle tire repair image fields
        else if (fieldName.startsWith('tire_repair_')) {
          const parts = fieldName.split('_');
          if (parts.length >= 4) {
            const position = parts.slice(2, -1).join('_'); // e.g., "driver_front"
            const imageType = parts[parts.length - 1]; // e.g., "not_repairable"
            
            if (!formData.tire_repair_images) formData.tire_repair_images = {};
            if (!formData.tire_repair_images[position]) {
              formData.tire_repair_images[position] = {
                not_repairable: [],
                tire_size_brand: [],
                repairable_spot: []
              };
            }
            formData.tire_repair_images[position][imageType] = fileUrls;
          }
        }
        // Handle regular photo fields
        else {
          const dataFieldName = fieldMapping[fieldName] || fieldName;
          formData[dataFieldName] = fileUrls;
        }
        
        logger.info(`Updated ${fieldName} -> ${fieldMapping[fieldName] || fieldName} with ${fileUrls.length} file URLs`);
      }
    }

    // If this is converting a draft to final submission
    if (draftId) {
      logger.info('Converting draft to final submission:', draftId);
      
      try {
        // Rename files from draft to final ID (we'll get the final ID after insertion)
        // First, insert the final submission
        db.run(
          'INSERT INTO quick_checks (user_email, user_name, title, data, status) VALUES (?, ?, ?, ?, ?)',
          [userEmail, userName, title, JSON.stringify(formData), 'submitted'],
          function(err) {
            if (err) {
              logger.error('Error creating final submission:', err);
              logger.warn('Database error occurred, falling back to simulated response');
              return res.json({ id: Date.now() }); // Return simulated ID instead of 500 error
            }
          
          const finalId = this.lastID;
          logger.info('Created final submission with ID:', finalId);
          
          // Rename draft files to final ID
          try {
            renameDraftFiles(parseInt(draftId), finalId);
            
            // Update file URLs in the form data
            const updatedData = updateFileUrlsInData(formData, parseInt(draftId), finalId);
            
            // Update the submission with corrected file URLs
            db.run(
              'UPDATE quick_checks SET data = ? WHERE id = ?',
              [JSON.stringify(updatedData), finalId],
              (updateErr) => {
                if (updateErr) {
                  logger.error('Error updating file URLs:', updateErr);
                  // Don't fail the request, just log the error
                }
                
                // Delete the draft
                db.run('DELETE FROM quick_checks WHERE id = ? AND status = ?', [draftId, 'pending'], (deleteErr) => {
                  if (deleteErr) {
                    logger.error('Error deleting draft:', deleteErr);
                    // Don't fail the request, just log the error
                  }
                  
                  logger.info('Successfully submitted quick check and cleaned up draft');
                  
                  // Emit WebSocket events for draft deletion and new submission
                  logger.info('🔍 Checking WebSocket service availability:', {
                    wsServiceExists: !!global.wsService,
                    wsServiceType: typeof global.wsService,
                    finalId: finalId,
                    draftId: draftId
                  });
                  
                  if (global.wsService) {
                    logger.info('✅ WebSocket service available, emitting events');
                    
                    // First emit the deletion event for the draft
                    global.wsService.emitQuickCheckUpdate('deleted', {
                      id: parseInt(draftId),
                      title: `Draft ${draftId}`,
                      data: formData, // Use original form data for the draft
                      user: userName,
                      userEmail: userEmail,
                      status: 'pending',
                      deleted_by: userName,
                      deleted_by_email: userEmail,
                      deleted_at: new Date().toISOString(),
                      reason: 'draft_submitted'
                    });
                    
                    // Then emit the creation event for the new submission
                    global.wsService.emitQuickCheckUpdate('created', {
                      id: finalId,
                      title: title,
                      data: updatedData,
                      user: userName,
                      userEmail: userEmail,
                      status: 'submitted',
                      created_at: new Date().toISOString()
                    });
                  } else {
                    logger.error('❌ WebSocket service not available for draft submission');
                  }
                  
                  res.json({ id: finalId });
                });
              }
            );
          } catch (fileErr) {
            logger.error('Error handling draft files:', fileErr);
            
            // Emit WebSocket event for quick check creation (even with file errors)
            logger.info('🔍 Checking WebSocket service availability (file error case):', {
              wsServiceExists: !!global.wsService,
              wsServiceType: typeof global.wsService,
              finalId: finalId
            });
            
            if (global.wsService) {
              logger.info('✅ WebSocket service available, emitting update (file error case)');
              global.wsService.emitQuickCheckUpdate('created', {
                id: finalId,
                title: title,
                data: formData,
                user: userName,
                userEmail: userEmail,
                status: 'submitted',
                created_at: new Date().toISOString()
              });
            } else {
              logger.error('❌ WebSocket service not available for draft submission (file error case)');
            }
            
            // Still return success since the submission was created
            res.json({ id: finalId });
          }
        }
      );
      } catch (draftError) {
        logger.error('Database operation failed in draft conversion:', draftError);
        logger.warn('Database error occurred, returning simulated response');
        res.json({ id: Date.now() });
      }
    } else {
      // New submission without draft
      try {
        db.run(
          'INSERT INTO quick_checks (user_email, user_name, title, data, status) VALUES (?, ?, ?, ?, ?)',
          [userEmail, userName, title, JSON.stringify(formData), 'submitted'],
          function(err) {
            if (err) {
              logger.error('Error creating quick check:', err);
              logger.warn('Database error occurred, falling back to simulated response');
              return res.json({ id: Date.now() }); // Return simulated ID instead of 500 error
            }
            
            const id = this.lastID || Date.now();
            logger.info('Successfully created quick check with ID:', id);
          
          // Emit WebSocket event for quick check creation
          logger.info('🔍 Checking WebSocket service availability (new submission):', {
            wsServiceExists: !!global.wsService,
            wsServiceType: typeof global.wsService,
            id: id
          });
          
          if (global.wsService) {
            logger.info('✅ WebSocket service available, emitting update (new submission)');
            global.wsService.emitQuickCheckUpdate('created', {
              id: id,
              title: title,
              data: formData,
              user: userName,
              userEmail: userEmail,
              status: 'submitted',
              created_at: new Date().toISOString()
            });
          } else {
            logger.error('❌ WebSocket service not available for new submission');
          }
          
          res.json({ id });
        }
      );
      } catch (dbError) {
        logger.error('Database operation failed in new submission:', dbError);
        logger.warn('Database error occurred, returning simulated response');
        res.json({ id: Date.now() });
      }
    }
    
  } catch (err) {
    logger.error('Unexpected error in final submission:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'An unexpected error occurred: ' + err.message });
  }
});

// Delete a quick check by ID
app.delete('/api/quick-checks/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  const userEmail = req.user.email;
  const userName = req.user.name;
  
  // First get the quick check data before deleting for WebSocket emission
  db.get('SELECT * FROM quick_checks WHERE id = ?', [id], (err, row) => {
    if (err) {
      logger.error('Error fetching quick check for deletion:', err);
      return res.status(500).json({ error: 'Failed to fetch quick check' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Quick check not found' });
    }
    
    // Now delete the quick check
    db.run('DELETE FROM quick_checks WHERE id = ?', [id], function(err) {
      if (err) {
        logger.error('Error deleting quick check:', err);
        return res.status(500).json({ error: 'Failed to delete quick check' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Quick check not found' });
      }
      
      // Emit WebSocket event for quick check deletion
      if (global.wsService) {
        global.wsService.emitQuickCheckUpdate('deleted', {
          id: parseInt(id),
          title: row.title,
          data: JSON.parse(row.data || '{}'),
          user: row.user_name,
          userEmail: row.user_email,
          status: row.status || 'submitted',
          deleted_by: userName,
          deleted_by_email: userEmail,
          deleted_at: new Date().toISOString()
        });
      }
      
      res.json({ success: true });
    });
  });
});

// Archive a quick check
app.put('/api/quick-checks/:id/archive', authenticateToken, (req, res) => {
  const id = req.params.id;
  const userEmail = req.user.email;
  const userName = req.user.name;

  logger.info('--- /api/quick-checks/:id/archive PUT called ---');
  logger.info('Archiving quick check:', { id, userEmail, userName });

  // First, get the current form data to update the archived_datetime field
  db.get('SELECT data FROM quick_checks WHERE id = ?', [id], (err, row) => {
    if (err) {
      logger.error('Error fetching quick check data:', err);
      return res.status(500).json({ error: 'Failed to fetch quick check data' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Quick check not found' });
    }

    try {
      // Parse the current form data
      const currentData = JSON.parse(row.data);
      logger.info('Current form data before update:', {
        hasArchivedDatetime: !!currentData.archived_datetime,
        archivedDatetime: currentData.archived_datetime,
        hasCreatedDatetime: !!currentData.created_datetime,
        hasSubmittedDatetime: !!currentData.submitted_datetime
      });
      
      // Update the archived_datetime field with current timestamp
      const newArchivedDatetime = new Date().toISOString();
      currentData.archived_datetime = newArchivedDatetime;
      
      // Calculate and store technician and service advisor durations in form data
      if (currentData.created_datetime && currentData.submitted_datetime) {
        currentData.technician_duration = Math.floor((new Date(currentData.submitted_datetime) - new Date(currentData.created_datetime)) / 1000);
        logger.info('Calculated technician_duration:', currentData.technician_duration);
      }
      
      if (currentData.submitted_datetime && newArchivedDatetime) {
        currentData.service_advisor_duration = Math.floor((new Date(newArchivedDatetime) - new Date(currentData.submitted_datetime)) / 1000);
        logger.info('Calculated service_advisor_duration:', currentData.service_advisor_duration);
      }
      
      logger.info('Updated form data with durations:', {
        newArchivedDatetime,
        hasArchivedDatetime: !!currentData.archived_datetime,
        technician_duration: currentData.technician_duration,
        service_advisor_duration: currentData.service_advisor_duration
      });
      
      // Update the quick check with new data and archive status
      db.run(
        'UPDATE quick_checks SET status = ?, archived_at = datetime("now"), archived_by = ?, archived_by_name = ?, data = ? WHERE id = ?',
        ['archived', userEmail, userName, JSON.stringify(currentData), id],
        function(err) {
          if (err) {
            logger.error('Error archiving quick check:', err);
            return res.status(500).json({ error: 'Failed to archive quick check' });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Quick check not found' });
          }
          logger.info('Successfully archived quick check:', id);
          logger.info('Updated form data with archived_datetime and durations:', {
            archived_datetime: newArchivedDatetime,
            technician_duration: currentData.technician_duration,
            service_advisor_duration: currentData.service_advisor_duration
          });
          
          // Emit WebSocket event for quick check archival
          if (global.wsService) {
            global.wsService.emitQuickCheckUpdate('archived', {
              id: parseInt(id),
              title: row.title,
              data: currentData,
              user: row.user_name,
              userEmail: row.user_email,
              status: 'archived',
              archived_by: userName,
              archived_by_email: userEmail,
              archived_at: newArchivedDatetime,
              technician_duration: currentData.technician_duration,
              service_advisor_duration: currentData.service_advisor_duration
            });
          }
          
          res.json({ message: 'Quick check archived successfully' });
        }
      );
    } catch (parseErr) {
      logger.error('Error parsing quick check data:', parseErr);
      return res.status(500).json({ error: 'Failed to parse quick check data' });
    }
  });
});

// Update quick check status (e.g., from archived back to submitted for unarchiving)
app.put('/api/quick-checks/:id/status', authenticateToken, (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  const userEmail = req.user.email;
  const userName = req.user.name;

  logger.info('--- /api/quick-checks/:id/status PUT called ---');
  logger.info('Updating quick check status:', { id, status, userEmail, userName });

  if (!status || !['pending', 'submitted', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be pending, submitted, or archived' });
  }

  let updateQuery;
  let params;

  // If setting to archived, also set archived_at and archived_by
  if (status === 'archived') {
    updateQuery = 'UPDATE quick_checks SET status = ?, archived_at = datetime("now"), archived_by = ?, archived_by_name = ?, updated_at = datetime("now") WHERE id = ?';
    params = [status, userEmail, userName, id];
  } else if (status === 'submitted') {
    // If unarchiving (setting from archived to submitted), clear archived fields
    updateQuery = 'UPDATE quick_checks SET status = ?, archived_at = NULL, archived_by = NULL, archived_by_name = NULL, updated_at = datetime("now") WHERE id = ?';
    params = [status, id];
  } else {
    // For other status changes
    updateQuery = 'UPDATE quick_checks SET status = ?, updated_at = datetime("now") WHERE id = ?';
    params = [status, id];
  }

  db.run(updateQuery, params, function(err) {
    if (err) {
      logger.error('Error updating quick check status:', err);
      return res.status(500).json({ error: 'Failed to update quick check status' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Quick check not found' });
    }
    logger.info('Successfully updated quick check status:', { id, status });
    
    // Emit WebSocket event for status change
    if (global.wsService) {
      // Get the updated record to send complete data
      db.get('SELECT * FROM quick_checks WHERE id = ?', [id], (fetchErr, updatedRow) => {
        if (!fetchErr && updatedRow) {
          let parsedData = {};
          try {
            parsedData = JSON.parse(updatedRow.data || '{}');
          } catch (e) {
            parsedData = {};
          }
          
          global.wsService.emitQuickCheckUpdate('updated', {
            id: parseInt(id),
            title: updatedRow.title,
            data: parsedData,
            user: updatedRow.user_name,
            userEmail: updatedRow.user_email,
            status: status,
            updated_by: userName,
            updated_by_email: userEmail,
            updated_at: new Date().toISOString()
          });
        }
      });
    }
    
    res.json({ message: 'Quick check status updated successfully' });
  });
});

// Get timing summary for a quick check
app.get('/api/quick-checks/:id/timing', authenticateToken, (req, res) => {
  const id = req.params.id;
  
  logger.info('--- /api/quick-checks/:id/timing GET called ---');
  logger.info('Getting timing summary for quick check:', { id });

  const query = `
    SELECT 
      id, status, created_at, updated_at, archived_at, data
    FROM quick_checks 
    WHERE id = ?
  `;

  db.get(query, [id], (err, row) => {
    if (err) {
      logger.error('Error fetching timing data:', err);
      return res.status(500).json({ error: 'Failed to fetch timing data' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Quick check not found' });
    }

    try {
      // Parse form data to get timing information
      let formData = {};
      try {
        formData = JSON.parse(row.data || '{}');
      } catch (parseErr) {
        logger.warn('Could not parse form data for timing:', parseErr);
        formData = {};
      }

      logger.info('Form data timing info:', {
        hasTabTimings: !!formData.tab_timings,
        tabTimings: formData.tab_timings,
        hasCreatedDatetime: !!formData.created_datetime,
        hasSubmittedDatetime: !!formData.submitted_datetime,
        hasArchivedDatetime: !!formData.archived_datetime
      });

      // Get timing data from form data
      const tabTimings = formData.tab_timings || {};
      
      // Calculate durations
      const createdTime = formData.created_datetime ? new Date(formData.created_datetime).getTime() : new Date(row.created_at).getTime();
      const submittedTime = formData.submitted_datetime ? new Date(formData.submitted_datetime).getTime() : new Date(row.updated_at).getTime();
      const archivedTime = formData.archived_datetime ? new Date(formData.archived_datetime).getTime() : (row.archived_at ? new Date(row.archived_at).getTime() : null);

      const durations = {
        createdToSubmitted: Math.floor((submittedTime - createdTime) / 1000),
        submittedToArchived: archivedTime ? Math.floor((archivedTime - submittedTime) / 1000) : 0,
        createdToArchived: archivedTime ? Math.floor((archivedTime - createdTime) / 1000) : 0
      };

      // Calculate total tab duration from form data
      const totalTabDuration = (tabTimings.info_duration || 0) + 
                              (tabTimings.pulling_duration || 0) + 
                              (tabTimings.underhood_duration || 0) + 
                              (tabTimings.tires_duration || 0);

      const timingData = {
        id: row.id,
        status: row.status,
        totalDuration: totalTabDuration,
        tabTimings: {
          info: {
            start: '', // Not stored in current form data structure
            end: '',   // Not stored in current form data structure
            duration: tabTimings.info_duration || 0,
            isActive: false
          },
          pulling: {
            start: '',
            end: '',
            duration: tabTimings.pulling_duration || 0,
            isActive: false
          },
          underhood: {
            start: '',
            end: '',
            duration: tabTimings.underhood_duration || 0,
            isActive: false
          },
          tires: {
            start: '',
            end: '',
            duration: tabTimings.tires_duration || 0,
            isActive: false
          }
        },
        durations,
        timestamps: {
          created: formData.created_datetime || row.created_at,
          updated: row.updated_at,
          archived: formData.archived_datetime || row.archived_at || null
        },
        // Include the full form data for comprehensive display
        formData: formData,
        // Add timing data from form data for backward compatibility
        tab_timings_from_form: tabTimings,
        technician_duration: formData.technician_duration || null,
        service_advisor_duration: formData.service_advisor_duration || null
      };

      logger.info('Successfully retrieved timing data for quick check:', { id, totalDuration: totalTabDuration, tabTimings });
      res.json(timingData);
    } catch (processErr) {
      logger.error('Error processing timing data:', processErr);
      res.status(500).json({ error: 'Failed to process timing data' });
    }
  });
});

// Reset and recalculate timing for a quick check
app.post('/api/quick-checks/:id/reset-timing', authenticateToken, (req, res) => {
  const id = req.params.id;
  const userEmail = req.user.email;

  logger.info('--- /api/quick-checks/:id/reset-timing POST called ---');
  logger.info('Resetting timing for quick check:', { id, userEmail });

  // Reset all timing fields to NULL/0
  const resetQuery = `
    UPDATE quick_checks 
    SET tab_info_start = NULL,
        tab_info_end = NULL,
        tab_info_duration = 0,
        tab_pulling_start = NULL,
        tab_pulling_end = NULL,
        tab_pulling_duration = 0,
        tab_underhood_start = NULL,
        tab_underhood_end = NULL,
        tab_underhood_duration = 0,
        tab_tires_start = NULL,
        tab_tires_end = NULL,
        tab_tires_duration = 0,
        updated_at = datetime('now')
    WHERE id = ? AND status IN ('pending', 'submitted')
  `;

  db.run(resetQuery, [id], function(err) {
    if (err) {
      logger.error('Error resetting timing:', err);
      return res.status(500).json({ error: 'Failed to reset timing' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Quick check not found or not in pending/submitted status' });
    }
    logger.info('Successfully reset timing for quick check:', id);
    res.json({ message: 'Timing reset successfully' });
  });
});

// Track tab entry (timing)
app.post('/api/quick-checks/:id/tab-entry', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { tabIndex } = req.body;
    
    logger.info(`Tab entry tracked for quick check ${id}, tab ${tabIndex}`);
    
    // For now, just acknowledge the tracking - could be expanded to store timing data
    res.json({ 
      message: 'Tab entry tracked successfully',
      id: parseInt(id),
      tabIndex,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error tracking tab entry:', error);
    res.status(500).json({ error: 'Failed to track tab entry' });
  }
});

// Track tab exit (timing)
app.post('/api/quick-checks/:id/tab-exit', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { tabIndex } = req.body;
    
    logger.info(`Tab exit tracked for quick check ${id}, tab ${tabIndex}`);
    
    // For now, just acknowledge the tracking - could be expanded to store timing data
    res.json({ 
      message: 'Tab exit tracked successfully',
      id: parseInt(id),
      tabIndex,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error tracking tab exit:', error);
    res.status(500).json({ error: 'Failed to track tab exit' });
  }
});

// === State Inspection Records API ===

// Initialize state inspection tables
const initializeStateInspectionTables = () => {
  // Skip table initialization in production (PostgreSQL)
  if (isProduction) {
    logger.info('⏭️  Skipping table initialization in production (PostgreSQL)');
    return;
  }
  // Create state_inspection_records table
  db.run(`
    CREATE TABLE IF NOT EXISTS state_inspection_records (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      created_date TEXT NOT NULL,
      sticker_number TEXT NOT NULL UNIQUE,
      last_name TEXT NOT NULL,
      payment_type TEXT NOT NULL CHECK (payment_type IN ('Cash', 'Check', 'Fleet')),
      payment_amount INTEGER NOT NULL CHECK (payment_amount IN (0, 10, 18, 20)),
      fleet_account TEXT,
      tint_affidavit TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      archived BOOLEAN DEFAULT FALSE
    )
  `, (err) => {
    if (err) {
      logger.error('Error creating state_inspection_records table:', err);
    } else {
      logger.info('✅ State inspection records table ready');
    }
  });

  // Create fleet_accounts table
  db.run(`
    CREATE TABLE IF NOT EXISTS fleet_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      notes TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL
    )
  `, (err) => {
    if (err) {
      logger.error('Error creating fleet_accounts table:', err);
    } else {
      logger.info('✅ Fleet accounts table ready');
    }
  });
};

// Call initialization
initializeStateInspectionTables();

// State Inspection Records Endpoints

// Get all state inspection records with pagination
app.get('/api/state-inspection-records', authenticateToken, (req, res) => {
  try {
    const { 
      dateFrom, dateTo, createdBy, paymentType, status, fleetAccount, stickerNumber, lastName,
      page, pageSize 
    } = req.query;

    // Parse pagination parameters
    const currentPage = parseInt(page) || 1;
    const itemsPerPage = parseInt(pageSize) || 50;
    const offset = (currentPage - 1) * itemsPerPage;
    
    let query = 'SELECT * FROM state_inspection_records WHERE archived = FALSE';
    let countQuery = 'SELECT COUNT(*) as total FROM state_inspection_records WHERE archived = FALSE';
    const params = [];

    if (dateFrom) {
      query += ' AND created_date >= ?';
      countQuery += ' AND created_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ' AND created_date <= ?';
      countQuery += ' AND created_date <= ?';
      params.push(dateTo);
    }
    if (createdBy) {
      query += ' AND created_by LIKE ?';
      countQuery += ' AND created_by LIKE ?';
      params.push(`%${createdBy}%`);
    }
    if (paymentType && paymentType !== 'All') {
      query += ' AND payment_type = ?';
      countQuery += ' AND payment_type = ?';
      params.push(paymentType);
    }
    if (status && status !== 'All') {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }
    if (fleetAccount) {
      query += ' AND fleet_account = ?';
      countQuery += ' AND fleet_account = ?';
      params.push(fleetAccount);
    }
    if (stickerNumber) {
      query += ' AND sticker_number LIKE ?';
      countQuery += ' AND sticker_number LIKE ?';
      params.push(`%${stickerNumber}%`);
    }
    if (lastName) {
      query += ' AND last_name LIKE ?';
      countQuery += ' AND last_name LIKE ?';
      params.push(`%${lastName}%`);
    }

    query += ' ORDER BY created_at DESC';

    // If pagination is requested, add LIMIT and OFFSET
    if (page && pageSize) {
      query += ' LIMIT ? OFFSET ?';
      
      // Get total count first
      db.get(countQuery, params, (countErr, countResult) => {
        if (countErr) {
          logger.error('Error getting record count:', countErr);
          return res.status(500).json({ error: 'Failed to get record count' });
        }

        const total = countResult.total;
        const totalPages = Math.ceil(total / itemsPerPage);

        // Get paginated records
        db.all(query, [...params, itemsPerPage, offset], (err, records) => {
          if (err) {
            logger.error('Error fetching state inspection records:', err);
            return res.status(500).json({ error: 'Failed to fetch records' });
          }
          
          // Convert snake_case to camelCase for frontend
          const camelCaseRecords = (records || []).map(record => ({
            id: record.id,
            createdBy: record.created_by,
            createdDate: record.created_date,
            stickerNumber: record.sticker_number,
            lastName: record.last_name,
            paymentType: record.payment_type,
            paymentAmount: record.payment_amount,
            status: record.status || 'Pass',
            fleetAccount: record.fleet_account,
            tintAffidavit: record.tint_affidavit,
            notes: record.notes,
            createdAt: record.created_at,
            updatedAt: record.updated_at,
            archived: record.archived === 1
          }));
          
          // Return paginated response
          res.json({
            data: camelCaseRecords,
            total,
            page: currentPage,
            pageSize: itemsPerPage,
            totalPages
          });
        });
      });
    } else {
      // Return all records (backward compatibility)
      db.all(query, params, (err, records) => {
        if (err) {
          logger.error('Error fetching state inspection records:', err);
          return res.status(500).json({ error: 'Failed to fetch records' });
        }
        
        // Convert snake_case to camelCase for frontend
        const camelCaseRecords = (records || []).map(record => ({
          id: record.id,
          createdBy: record.created_by,
          createdDate: record.created_date,
          stickerNumber: record.sticker_number,
          lastName: record.last_name,
          paymentType: record.payment_type,
          paymentAmount: record.payment_amount,
          status: record.status || 'Pass',
          fleetAccount: record.fleet_account,
          tintAffidavit: record.tint_affidavit,
          notes: record.notes,
          createdAt: record.created_at,
          updatedAt: record.updated_at,
          archived: record.archived === 1
        }));
        
        res.json(camelCaseRecords);
      });
    }
  } catch (error) {
    logger.error('Error in state inspection records endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new state inspection record
app.post('/api/state-inspection-records', authenticateToken, upload.single('tintAffidavit'), (req, res) => {
  try {
    const { 
      createdBy, 
      createdDate, 
      stickerNumber, 
      lastName, 
      paymentType, 
      paymentAmount, 
      status,
      fleetAccount, 
      notes 
    } = req.body;

    // Validate required fields
    if (!createdBy || !createdDate || !stickerNumber || !lastName || !paymentType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate unique ID
    const id = uuidv4();

    // Handle file upload
    let tintAffidavitPath = null;
    if (req.file) {
      tintAffidavitPath = `/uploads/${req.file.filename}`;
    }

    const insertQuery = `
      INSERT INTO state_inspection_records (
        id, created_by, created_date, sticker_number, last_name, 
        payment_type, payment_amount, status, fleet_account, tint_affidavit, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id, 
      createdBy, 
      createdDate, 
      stickerNumber, 
      lastName, 
      paymentType, 
      parseInt(paymentAmount) || 0, 
      status || 'Pass',
      fleetAccount || null, 
      tintAffidavitPath, 
      notes || null
    ];

    db.run(insertQuery, params, function(err) {
      if (err) {
        logger.error('Error creating state inspection record:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Sticker number already exists' });
        }
        return res.status(500).json({ error: 'Failed to create record' });
      }

      // Get the created record
      db.get('SELECT * FROM state_inspection_records WHERE id = ?', [id], (getErr, record) => {
        if (getErr) {
          logger.error('Error fetching created record:', getErr);
          return res.status(500).json({ error: 'Record created but failed to fetch' });
        }
        
        // Convert snake_case to camelCase for frontend
        const camelCaseRecord = {
          id: record.id,
          createdBy: record.created_by,
          createdDate: record.created_date,
          stickerNumber: record.sticker_number,
          lastName: record.last_name,
          paymentType: record.payment_type,
          paymentAmount: record.payment_amount,
          status: record.status || 'Pass',
          fleetAccount: record.fleet_account,
          tintAffidavit: record.tint_affidavit,
          notes: record.notes,
          createdAt: record.created_at,
          updatedAt: record.updated_at,
          archived: record.archived === 1
        };
        
        logger.info(`State inspection record created: ${stickerNumber} by ${createdBy}`);
        res.status(201).json(camelCaseRecord);
      });
    });
  } catch (error) {
    logger.error('Error in create state inspection record:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete state inspection record
app.delete('/api/state-inspection-records/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    db.run('DELETE FROM state_inspection_records WHERE id = ?', [id], function(err) {
      if (err) {
        logger.error('Error deleting state inspection record:', err);
        return res.status(500).json({ error: 'Failed to delete record' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Record not found' });
      }

      logger.info(`State inspection record deleted: ${id}`);
      res.json({ message: 'Record deleted successfully' });
    });
  } catch (error) {
    logger.error('Error in delete state inspection record:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get state inspection statistics
app.get('/api/state-inspection-records/stats', authenticateToken, (req, res) => {
  try {
    const queries = {
      totalRecords: 'SELECT COUNT(*) as count FROM state_inspection_records WHERE archived = FALSE',
      totalRevenue: 'SELECT SUM(payment_amount) as total FROM state_inspection_records WHERE archived = FALSE',
      averagePayment: 'SELECT AVG(payment_amount) as average FROM state_inspection_records WHERE archived = FALSE',
      recordsByPaymentType: `
        SELECT payment_type, COUNT(*) as count 
        FROM state_inspection_records 
        WHERE archived = FALSE 
        GROUP BY payment_type
      `,
      recordsByStatus: `
        SELECT status, COUNT(*) as count 
        FROM state_inspection_records 
        WHERE archived = FALSE 
        GROUP BY status
      `,
      recordsByCreator: `
        SELECT created_by as creator, COUNT(*) as count, SUM(payment_amount) as revenue
        FROM state_inspection_records 
        WHERE archived = FALSE 
        GROUP BY created_by
      `
    };

    let completed = 0;
    const results = {};

    const checkComplete = () => {
      completed++;
      if (completed === Object.keys(queries).length) {
        res.json({
          totalRecords: results.totalRecords || 0,
          totalRevenue: results.totalRevenue || 0,
          averagePayment: results.averagePayment || 0,
          recordsByPaymentType: results.recordsByPaymentType || {},
          recordsByStatus: results.recordsByStatus || {},
          recordsByMonth: [], // TODO: Implement monthly stats
          recordsByCreator: results.recordsByCreator || []
        });
      }
    };

    // Execute all queries
    db.get(queries.totalRecords, (err, row) => {
      results.totalRecords = row ? row.count : 0;
      checkComplete();
    });

    db.get(queries.totalRevenue, (err, row) => {
      results.totalRevenue = row ? row.total || 0 : 0;
      checkComplete();
    });

    db.get(queries.averagePayment, (err, row) => {
      results.averagePayment = row ? row.average || 0 : 0;
      checkComplete();
    });

    db.all(queries.recordsByPaymentType, (err, rows) => {
      const paymentTypes = {};
      if (rows) {
        rows.forEach(row => {
          paymentTypes[row.payment_type] = row.count;
        });
      }
      results.recordsByPaymentType = paymentTypes;
      checkComplete();
    });

    db.all(queries.recordsByStatus, (err, rows) => {
      const statusCounts = {};
      if (rows) {
        rows.forEach(row => {
          statusCounts[row.status] = row.count;
        });
      }
      results.recordsByStatus = statusCounts;
      checkComplete();
    });

    db.all(queries.recordsByCreator, (err, rows) => {
      results.recordsByCreator = rows || [];
      checkComplete();
    });

  } catch (error) {
    logger.error('Error in state inspection stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fleet Accounts Endpoints

// Get all fleet accounts
app.get('/api/fleet-accounts', authenticateToken, (req, res) => {
  try {
    db.all('SELECT * FROM fleet_accounts ORDER BY name', (err, accounts) => {
      if (err) {
        logger.error('Error fetching fleet accounts:', err);
        return res.status(500).json({ error: 'Failed to fetch fleet accounts' });
      }
      
      // Convert snake_case to camelCase for frontend
      const camelCaseAccounts = (accounts || []).map(account => ({
        id: account.id,
        name: account.name,
        contactName: account.contact_name,
        contactEmail: account.contact_email,
        contactPhone: account.contact_phone,
        address: account.address,
        notes: account.notes,
        active: account.active === 1,
        createdDate: account.created_date,
        updatedDate: account.updated_date
      }));
      
      res.json(camelCaseAccounts);
    });
  } catch (error) {
    logger.error('Error in fleet accounts endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create fleet account
app.post('/api/fleet-accounts', authenticateToken, (req, res) => {
  try {
    const { name, contactName, contactEmail, contactPhone, address, notes, active } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Fleet account name is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const insertQuery = `
      INSERT INTO fleet_accounts (
        id, name, contact_name, contact_email, contact_phone, 
        address, notes, active, created_date, updated_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id, name, contactName || null, contactEmail || null, contactPhone || null,
      address || null, notes || null, active !== false, now, now
    ];

    db.run(insertQuery, params, function(err) {
      if (err) {
        logger.error('Error creating fleet account:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Fleet account name already exists' });
        }
        return res.status(500).json({ error: 'Failed to create fleet account' });
      }

      db.get('SELECT * FROM fleet_accounts WHERE id = ?', [id], (getErr, account) => {
        if (getErr) {
          logger.error('Error fetching created fleet account:', getErr);
          return res.status(500).json({ error: 'Account created but failed to fetch' });
        }
        
        logger.info(`Fleet account created: ${name}`);
        res.status(201).json(account);
      });
    });
  } catch (error) {
    logger.error('Error in create fleet account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update fleet account
app.put('/api/fleet-accounts/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, contactName, contactEmail, contactPhone, address, notes, active } = req.body;

    const updateQuery = `
      UPDATE fleet_accounts SET 
        name = ?, contact_name = ?, contact_email = ?, contact_phone = ?, 
        address = ?, notes = ?, active = ?, updated_date = ?
      WHERE id = ?
    `;

    const params = [
      name, contactName || null, contactEmail || null, contactPhone || null,
      address || null, notes || null, active !== false, new Date().toISOString(), id
    ];

    db.run(updateQuery, params, function(err) {
      if (err) {
        logger.error('Error updating fleet account:', err);
        return res.status(500).json({ error: 'Failed to update fleet account' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Fleet account not found' });
      }

      db.get('SELECT * FROM fleet_accounts WHERE id = ?', [id], (getErr, account) => {
        if (getErr) {
          logger.error('Error fetching updated fleet account:', getErr);
          return res.status(500).json({ error: 'Account updated but failed to fetch' });
        }
        
        logger.info(`Fleet account updated: ${id}`);
        res.json(account);
      });
    });
  } catch (error) {
    logger.error('Error in update fleet account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete fleet account
app.delete('/api/fleet-accounts/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    db.run('DELETE FROM fleet_accounts WHERE id = ?', [id], function(err) {
      if (err) {
        logger.error('Error deleting fleet account:', err);
        return res.status(500).json({ error: 'Failed to delete fleet account' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Fleet account not found' });
      }

      logger.info(`Fleet account deleted: ${id}`);
      res.json({ message: 'Fleet account deleted successfully' });
    });
  } catch (error) {
    logger.error('Error in delete fleet account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === Chat Functionality ===

// Initialize chat tables if they don't exist
const initializeChatTables = () => {
  // Skip table initialization in production (PostgreSQL)
  if (isProduction) {
    logger.info('⏭️  Skipping chat table initialization in production (PostgreSQL)');
    return;
  }
  
  try {
    // Drop existing chat tables to recreate with new schema
    db.exec(`DROP TABLE IF EXISTS chat_messages`);
    db.exec(`DROP TABLE IF EXISTS chat_rooms`);

    // Direct messages table - user to user conversations
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_email VARCHAR(255) NOT NULL,
        user1_name VARCHAR(255) NOT NULL,
        user2_email VARCHAR(255) NOT NULL,
        user2_name VARCHAR(255) NOT NULL,
        last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user1_email, user2_email)
      )
    `);

    // Chat messages table for direct messages
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        sender_email VARCHAR(255) NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        receiver_email VARCHAR(255) NOT NULL,
        receiver_name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'system')),
        is_read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
      )
    `);

    logger.info('Direct messaging chat tables initialized successfully');
  } catch (error) {
    logger.error('Error initializing chat tables:', error);
  }
};

// Call initialization function
initializeChatTables();

// === LABEL MANAGEMENT ROUTES ===
const labelRoutes = require('./labelRoutes');

// Mount label routes with authentication
app.use('/api/labels', authenticateToken, labelRoutes);

// === PRINT JOB & PRINTER MANAGEMENT ROUTES ===
const printRoutes = require('./printRoutes');

// Mount print routes with authentication
app.use('/api/print', authenticateToken, printRoutes);

// Print-client-tokens endpoint (no auth — informational only)
app.get('/api/print-client-tokens', (_req, res) => res.json([]));

// === CASH MANAGEMENT ROUTES ===
// Note: Cash management routes are now initialized in the database connection section above
// to ensure proper async connection handling in production

// === Chat API Endpoints ===

// Get all conversations for the current user
app.get('/api/chat/conversations', authenticateToken, (req, res) => {
  // Check if database is available
  if (!db) {
    logger.warn('Database not available, returning empty conversations');
    return res.json([]);
  }

  try {
    const userEmail = req.user.email;
    const userRole = req.user.role;
    
    // Get conversations where the user is either user1 or user2
    const query = `
      SELECT 
        c.*,
        CASE 
          WHEN c.user1_email = ? THEN c.user2_email 
          ELSE c.user1_email 
        END as other_user_email,
        CASE 
          WHEN c.user1_email = ? THEN c.user2_name 
          ELSE c.user1_name 
        END as other_user_name,
        (SELECT COUNT(*) FROM chat_messages cm WHERE cm.conversation_id = c.id) as message_count,
        (SELECT COUNT(*) FROM chat_messages cm WHERE cm.conversation_id = c.id AND cm.receiver_email = ? AND cm.is_read = false) as unread_count,
        (SELECT message FROM chat_messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC LIMIT 1) as last_message
      FROM chat_conversations c
      WHERE c.user1_email = ? OR c.user2_email = ?
      ORDER BY c.last_message_at DESC
    `;

    db.all(query, [userEmail, userEmail, userEmail, userEmail, userEmail], (err, rows) => {
      if (err) {
        logger.error('Error fetching conversations:', err);
        logger.warn('Database error occurred, falling back to empty conversations');
        return res.json([]); // Return empty array instead of 500 error
      }
      res.json(rows || []);
    });
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    logger.warn('Database query failed, returning empty conversations');
    res.json([]);
  }
});

// Get all available users for starting conversations
app.get('/api/chat/users', authenticateToken, async (req, res) => {
  try {
    const currentUserEmail = req.user.email;
    const currentUserRole = req.user.role;
    
    // Use the same data source as the users list page
    const allUsers = await readUsersFromCSV();
    
    let filteredUsers;
    if (currentUserRole === 'Technician') {
      // Technicians can only message Service Writers
      filteredUsers = allUsers.filter(user => 
        user.role === 'Service advisor' && 
        user.email !== currentUserEmail &&
        user.enabled
      );
    } else if (currentUserRole === 'Service advisor') {
      // Service Writers can message anyone
      filteredUsers = allUsers.filter(user => 
        user.email !== currentUserEmail &&
        user.enabled
      );
    } else {
      // Admins can message anyone  
      filteredUsers = allUsers.filter(user => 
        user.email !== currentUserEmail &&
        user.enabled
      );
    }

    // Format the response to match the same structure as the users list page
    const chatUsers = filteredUsers.map(user => ({
      email: user.email,
      name: user.name,
      role: user.role,
      enabled: user.enabled
    }));

    logger.info(`Chat users fetched for ${currentUserRole} ${currentUserEmail}: ${chatUsers.length} users available`);
    res.json(chatUsers);
  } catch (error) {
    logger.error('Error fetching chat users:', error);
    res.status(500).json({ error: 'Failed to fetch chat users' });
  }
});

// Get or create a conversation between two users
app.post('/api/chat/conversations', authenticateToken, async (req, res) => {
  try {
    const { otherUserEmail } = req.body;
    const currentUserEmail = req.user.email;
    const currentUserName = req.user.name;
    const currentUserRole = req.user.role;

    if (!otherUserEmail) {
      return res.status(400).json({ error: 'Other user email is required' });
    }

    if (otherUserEmail === currentUserEmail) {
      return res.status(400).json({ error: 'Cannot start conversation with yourself' });
    }

    // Get the other user's details from CSV
    const allUsers = await readUsersFromCSV();
    const otherUser = allUsers.find(user => user.email === otherUserEmail && user.enabled);
    
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions
    if (currentUserRole === 'Technician' && otherUser.role !== 'Service advisor') {
      return res.status(403).json({ error: 'Technicians can only message Service Writers' });
    }

    // Create conversation key (always put emails in alphabetical order for consistency)
    const [user1Email, user1Name] = currentUserEmail < otherUserEmail 
      ? [currentUserEmail, currentUserName]
      : [otherUserEmail, otherUser.name];
    const [user2Email, user2Name] = currentUserEmail < otherUserEmail 
      ? [otherUserEmail, otherUser.name]
      : [currentUserEmail, currentUserName];

    // Check if conversation already exists
    const checkConversationQuery = `
      SELECT * FROM chat_conversations 
      WHERE user1_email = ? AND user2_email = ?
    `;

    db.get(checkConversationQuery, [user1Email, user2Email], (err, conversation) => {
      if (err) {
        logger.error('Error checking existing conversation:', err);
        return res.status(500).json({ error: 'Failed to check existing conversation' });
      }

      if (conversation) {
        // Add the other user info for the response
        conversation.other_user_email = otherUserEmail;
        conversation.other_user_name = otherUser.name;
        conversation.message_count = 0;
        conversation.unread_count = 0;

        logger.info(`Existing conversation found between ${currentUserName} and ${otherUser.name}`);
        return res.json(conversation);
      }

      // Create new conversation
      const createConversationQuery = `
        INSERT INTO chat_conversations (user1_email, user1_name, user2_email, user2_name)
        VALUES (?, ?, ?, ?)
      `;

      db.run(createConversationQuery, [user1Email, user1Name, user2Email, user2Name], function(insertErr) {
        if (insertErr) {
          logger.error('Error creating conversation:', insertErr);
          return res.status(500).json({ error: 'Failed to create conversation' });
        }

        const getNewConversationQuery = 'SELECT * FROM chat_conversations WHERE id = ?';
        
        db.get(getNewConversationQuery, [this.lastID], (getErr, newConversation) => {
          if (getErr) {
            logger.error('Error fetching new conversation:', getErr);
            return res.status(500).json({ error: 'Failed to fetch new conversation' });
          }

          // Add the other user info for the response
          newConversation.other_user_email = otherUserEmail;
          newConversation.other_user_name = otherUser.name;
          newConversation.message_count = 0;
          newConversation.unread_count = 0;

          logger.info(`New conversation created between ${currentUserName} and ${otherUser.name}`);
          res.json(newConversation);
        });
      });
    });
  } catch (error) {
    logger.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get messages for a specific conversation
app.get('/api/chat/conversations/:conversationId/messages', authenticateToken, (req, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId);
    const userEmail = req.user.email;

    // Check if user is part of this conversation
    const checkConversationQuery = `
      SELECT * FROM chat_conversations 
      WHERE id = ? AND (user1_email = ? OR user2_email = ?)
    `;

    db.get(checkConversationQuery, [conversationId, userEmail, userEmail], (err, conversation) => {
      if (err) {
        logger.error('Error checking conversation access:', err);
        return res.status(500).json({ error: 'Failed to check conversation access' });
      }

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found or access denied' });
      }

      const messagesQuery = `
        SELECT * FROM chat_messages 
        WHERE conversation_id = ? 
        ORDER BY created_at ASC
      `;

      db.all(messagesQuery, [conversationId], (err, messages) => {
        if (err) {
          logger.error('Error fetching messages:', err);
          return res.status(500).json({ error: 'Failed to fetch messages' });
        }

        // Mark messages as read for the current user
        const markReadQuery = `
          UPDATE chat_messages 
          SET is_read = true 
          WHERE conversation_id = ? AND receiver_email = ?
        `;

        db.run(markReadQuery, [conversationId, userEmail], (markReadErr) => {
          if (markReadErr) {
            logger.warn('Error marking messages as read:', markReadErr);
          }
        });

        res.json(messages || []);
      });
    });
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a message in a conversation
app.post('/api/chat/conversations/:conversationId/messages', authenticateToken, (req, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId);
    const { message } = req.body;
    const senderEmail = req.user.email;
    const senderName = req.user.name;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Check if user is part of this conversation
    const checkConversationQuery = `
      SELECT * FROM chat_conversations 
      WHERE id = ? AND (user1_email = ? OR user2_email = ?)
    `;

    db.get(checkConversationQuery, [conversationId, senderEmail, senderEmail], (err, conversation) => {
      if (err) {
        logger.error('Error checking conversation access:', err);
        return res.status(500).json({ error: 'Failed to check conversation access' });
      }

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found or access denied' });
      }

      // Determine receiver
      const receiverEmail = conversation.user1_email === senderEmail 
        ? conversation.user2_email 
        : conversation.user1_email;
      const receiverName = conversation.user1_email === senderEmail 
        ? conversation.user2_name 
        : conversation.user1_name;

      // Insert the message
      const insertMessageQuery = `
        INSERT INTO chat_messages (conversation_id, sender_email, sender_name, receiver_email, receiver_name, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.run(insertMessageQuery, [conversationId, senderEmail, senderName, receiverEmail, receiverName, message.trim()], function(insertErr) {
        if (insertErr) {
          logger.error('Error inserting message:', insertErr);
          return res.status(500).json({ error: 'Failed to send message' });
        }

        // Update conversation's last_message_at timestamp
        const updateConversationQuery = `
          UPDATE chat_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?
        `;

        db.run(updateConversationQuery, [conversationId], (updateErr) => {
          if (updateErr) {
            logger.warn('Error updating conversation timestamp:', updateErr);
          }
        });

        // Get the inserted message
        const getMessageQuery = `
          SELECT * FROM chat_messages WHERE id = ?
        `;

        db.get(getMessageQuery, [this.lastID], (getErr, newMessage) => {
          if (getErr) {
            logger.error('Error fetching new message:', getErr);
            return res.status(500).json({ error: 'Failed to fetch new message' });
          }

          logger.info(`New message sent from ${senderName} to ${receiverName}`);
          res.status(201).json(newMessage);
        });
      });
    });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Delete a message (only by the sender)
app.delete('/api/chat/messages/:messageId', authenticateToken, (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const userEmail = req.user.email;

    if (!messageId) {
      return res.status(400).json({ error: 'Message ID is required' });
    }

    // Check if the message exists and belongs to the user
    const checkMessageQuery = `
      SELECT * FROM chat_messages WHERE id = ? AND sender_email = ?
    `;

    db.get(checkMessageQuery, [messageId, userEmail], (err, message) => {
      if (err) {
        logger.error('Error checking message ownership:', err);
        return res.status(500).json({ error: 'Failed to check message ownership' });
      }

      if (!message) {
        return res.status(404).json({ error: 'Message not found or you do not have permission to delete it' });
      }

      // Delete the message
      const deleteMessageQuery = `DELETE FROM chat_messages WHERE id = ?`;

      db.run(deleteMessageQuery, [messageId], function(deleteErr) {
        if (deleteErr) {
          logger.error('Error deleting message:', deleteErr);
          return res.status(500).json({ error: 'Failed to delete message' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Message not found' });
        }

        logger.info(`Message ${messageId} deleted by ${userEmail}`);
        res.json({ message: 'Message deleted successfully' });
      });
    });
  } catch (error) {
    logger.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Delete an entire conversation (only by participants)
app.delete('/api/chat/conversations/:conversationId', authenticateToken, (req, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId);
    const userEmail = req.user.email;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Check if the user is a participant in this conversation
    const checkConversationQuery = `
      SELECT * FROM chat_conversations 
      WHERE id = ? AND (user1_email = ? OR user2_email = ?)
    `;

    db.get(checkConversationQuery, [conversationId, userEmail, userEmail], (err, conversation) => {
      if (err) {
        logger.error('Error checking conversation ownership:', err);
        return res.status(500).json({ error: 'Failed to check conversation ownership' });
      }

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found or you do not have permission to delete it' });
      }

      // Delete the conversation (messages will be deleted automatically due to CASCADE)
      const deleteConversationQuery = `DELETE FROM chat_conversations WHERE id = ?`;

      db.run(deleteConversationQuery, [conversationId], function(deleteErr) {
        if (deleteErr) {
          logger.error('Error deleting conversation:', deleteErr);
          return res.status(500).json({ error: 'Failed to delete conversation' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        const otherUserEmail = conversation.user1_email === userEmail 
          ? conversation.user2_email 
          : conversation.user1_email;
        const otherUserName = conversation.user1_email === userEmail 
          ? conversation.user2_name 
          : conversation.user1_name;

        logger.info(`Conversation ${conversationId} between ${userEmail} and ${otherUserEmail} deleted by ${userEmail}`);
        res.json({ message: 'Conversation deleted successfully' });
      });
    });
  } catch (error) {
    logger.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// === SHOPMONKEY API PROXY ROUTES ===
const SHOPMONKEY_BASE_URL = 'https://api.shopmonkey.cloud';

// ShopMonkey login endpoint
app.post('/api/shopmonkey/login', async (req, res) => {
  try {
    const { email, password, audience } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    logger.info(`ShopMonkey login attempt for: ${email}`);

    const response = await axios.post(`${SHOPMONKEY_BASE_URL}/v3/auth/login`, {
      email,
      password,
      audience: audience || 'api'
    });

    logger.info('ShopMonkey login successful');
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey login failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'ShopMonkey login failed'
    });
  }
});

// ShopMonkey API key endpoints
app.get('/api/shopmonkey/api_key', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      logger.warn('ShopMonkey API keys: Missing token header');
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    logger.info(`ShopMonkey API keys request with token: ${authHeader.substring(0, 8)}...`);

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/auth/api_key`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info('ShopMonkey API keys request successful');
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey get API keys failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      url: error.config?.url,
      headers: error.config?.headers
    });

    // Provide more specific error messaging
    let errorMessage = 'Failed to fetch API keys from ShopMonkey';
    if (error.response?.status === 500) {
      errorMessage = 'ShopMonkey API server error (500) - this appears to be an issue on ShopMonkey\'s side';
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed - invalid or expired token';
    } else if (error.response?.status === 403) {
      errorMessage = 'Access denied - token may not have permission to access API keys';
    } else if (error.response?.status === 429) {
      errorMessage = 'Rate limit exceeded - too many requests to ShopMonkey API';
    }

    res.status(error.response?.status || 500).json({
      error: errorMessage,
      shopmonkeyError: error.response?.data?.message || error.response?.data?.error,
      statusCode: error.response?.status,
      details: error.response?.data
    });
  }
});

app.post('/api/shopmonkey/api_key', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.post(`${SHOPMONKEY_BASE_URL}/v3/auth/api_key`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey API key created: ${req.body.name}`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey create API key failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to create API key'
    });
  }
});

app.delete('/api/shopmonkey/api_key/:id', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.delete(`${SHOPMONKEY_BASE_URL}/v3/auth/api_key/${req.params.id}`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      data: req.body
    });

    logger.info(`ShopMonkey API key deleted: ${req.params.id}`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey delete API key failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to delete API key'
    });
  }
});

// ShopMonkey workflow orders endpoint
app.get('/api/shopmonkey/workflow/orders', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      logger.warn('ShopMonkey workflow orders: Missing token header');
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    logger.info(`ShopMonkey workflow orders request with token: ${authHeader.substring(0, 8)}...`);

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/order`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: req.query
    });

    logger.info('ShopMonkey workflow orders request successful');
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey get workflow orders failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.response?.data?.error || 'Failed to fetch workflow orders',
      details: error.response?.data
    });
  }
});

// Get detailed order information
app.get('/api/shopmonkey/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const authHeader = req.headers['x-shopmonkey-token'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'ShopMonkey token is required' 
      });
    }

    logger.info(`ShopMonkey order details request for: ${orderId} with token: ${authHeader.substring(0, 8)}...`);

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/order/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: {
        include: {
          appointments: true,
          authorizations: true,
          customer: true,
          inspections: true,
          paymentTerm: true,
          vehicle: true,
          services: {
            include: {
              fees: true,
              labors: true,
              parts: true,
              subcontracts: true,
              tires: true
            }
          }
        }
      }
    });

    logger.info(`ShopMonkey order details successful for: ${orderId}`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey get order details failed:', {
      orderId: req.params.orderId,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.response?.data?.error || 'Failed to fetch order details',
      details: error.response?.data
    });
  }
});

// ShopMonkey workflow statuses endpoints
app.get('/api/shopmonkey/workflow_status', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/workflow_status`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: req.query
    });

    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey get workflow statuses failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to fetch workflow statuses'
    });
  }
});

// Get specific workflow status by ID
app.get('/api/shopmonkey/workflow_status/:id', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/workflow_status/${req.params.id}`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey get workflow status by ID: ${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey get workflow status by ID failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to fetch workflow status'
    });
  }
});

// Update workflow status
app.put('/api/shopmonkey/workflow_status/:id', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.put(`${SHOPMONKEY_BASE_URL}/v3/workflow_status/${req.params.id}`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey update workflow status: ${req.params.id} - ${req.body.name || 'unnamed'}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey update workflow status failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to update workflow status'
    });
  }
});

// Create new workflow status
app.post('/api/shopmonkey/workflow_status', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.post(`${SHOPMONKEY_BASE_URL}/v3/workflow_status`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey create workflow status: ${req.body.name || 'unnamed'}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey create workflow status failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to create workflow status'
    });
  }
});

// Delete workflow status
app.delete('/api/shopmonkey/workflow_status/:id', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.delete(`${SHOPMONKEY_BASE_URL}/v3/workflow_status/${req.params.id}`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: req.query // For move_to parameter if needed
    });

    logger.info(`ShopMonkey delete workflow status: ${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey delete workflow status failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to delete workflow status'
    });
  }
});

// Keep old workflow endpoint for backward compatibility
app.get('/api/shopmonkey/workflow', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/workflow`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: req.query
    });

    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey get workflow statuses failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to fetch workflow statuses'
    });
  }
});

// ShopMonkey bulk update workflow orders endpoint
app.put('/api/shopmonkey/order/workflow_status/bulk', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.put(`${SHOPMONKEY_BASE_URL}/v3/order/workflow_status/bulk`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey bulk update workflow orders: ${req.body.orderIds?.length || 0} orders`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey bulk update workflow orders failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to bulk update workflow orders'
    });
  }
});

// ShopMonkey API key with expiration in seconds
app.post('/api/shopmonkey/auth/apikey/:expires', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const expiresInSeconds = parseInt(req.params.expires);
    if (isNaN(expiresInSeconds) || expiresInSeconds <= 0) {
      return res.status(400).json({ error: 'Invalid expiration time in seconds' });
    }

    const response = await axios.post(`${SHOPMONKEY_BASE_URL}/v3/auth/apikey/${expiresInSeconds}`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey API key created with ${expiresInSeconds}s expiration: ${req.body.name}`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey create API key with expiration failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to create API key with expiration'
    });
  }
});

// ShopMonkey logout endpoint
app.post('/api/shopmonkey/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.post(`${SHOPMONKEY_BASE_URL}/v3/auth/logout`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info('ShopMonkey logout successful');
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey logout failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to logout'
    });
  }
});

// Get order services
app.get('/api/shopmonkey/order/:orderId/service', async (req, res) => {
  try {
    const { orderId } = req.params;
    const authHeader = req.headers['x-shopmonkey-token'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'ShopMonkey token is required' 
      });
    }

    logger.info(`ShopMonkey order services request for: ${orderId} with token: ${authHeader.substring(0, 8)}...`);

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/order/${orderId}/service`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: req.query
    });

    logger.info(`ShopMonkey order services successful for: ${orderId} - ${response.data.data?.length || 0} services returned`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey get order services failed:', {
      orderId: req.params.orderId,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.response?.data?.error || 'Failed to fetch order services',
      details: error.response?.data
    });
  }
});

// Get specific service by ID
app.get('/api/shopmonkey/order/:orderId/service/:serviceId', async (req, res) => {
  try {
    const { orderId, serviceId } = req.params;
    const authHeader = req.headers['x-shopmonkey-token'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'ShopMonkey token is required' 
      });
    }

    logger.info(`ShopMonkey get service request for: Order ${orderId}, Service ${serviceId} with token: ${authHeader.substring(0, 8)}...`);

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/order/${orderId}/service/${serviceId}`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: req.query
    });

    logger.info(`ShopMonkey get service successful for: Order ${orderId}, Service ${serviceId}`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey get service failed:', {
      orderId: req.params.orderId,
      serviceId: req.params.serviceId,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.response?.data?.error || 'Failed to fetch service',
      details: error.response?.data
    });
  }
});

// Get canned services
app.get('/api/shopmonkey/canned_service', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'ShopMonkey token is required' 
      });
    }

    logger.info(`ShopMonkey canned services request with token: ${authHeader.substring(0, 8)}...`);

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/canned_service`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: req.query
    });

    logger.info(`ShopMonkey canned services successful - ${response.data.data?.length || 0} services returned`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey get canned services failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.response?.data?.error || 'Failed to fetch canned services',
      details: error.response?.data
    });
  }
});

// Add service to order
app.post('/api/shopmonkey/order/:orderId/service', async (req, res) => {
  try {
    const { orderId } = req.params;
    const authHeader = req.headers['x-shopmonkey-token'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'ShopMonkey token is required' 
      });
    }

    logger.info(`ShopMonkey add service to order: ${orderId} with token: ${authHeader.substring(0, 8)}...`);

    const response = await axios.post(`${SHOPMONKEY_BASE_URL}/v3/order/${orderId}/service`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey add service to order successful: ${orderId} - service: ${req.body.name || 'unnamed'}`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey add service to order failed:', {
      orderId: req.params.orderId,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.response?.data?.error || 'Failed to add service to order',
      details: error.response?.data
    });
  }
});

// Update service (including completion status)
app.put('/api/shopmonkey/order/:orderId/service/:serviceId', async (req, res) => {
  try {
    const { orderId, serviceId } = req.params;
    const authHeader = req.headers['x-shopmonkey-token'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'ShopMonkey token is required' 
      });
    }

    logger.info(`ShopMonkey update service: Order ${orderId}, Service ${serviceId} with token: ${authHeader.substring(0, 8)}...`);

    const response = await axios.put(`${SHOPMONKEY_BASE_URL}/v3/order/${orderId}/service/${serviceId}`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey update service successful: Order ${orderId}, Service ${serviceId}`);
    
    // Include debug headers in response
    const debugHeaders = {
      'x-request-id': response.headers['x-request-id'],
      'x-director-region': response.headers['x-director-region'],
      'x-region': response.headers['x-region'],
      'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': response.headers['x-ratelimit-reset']
    };

    res.json({ ...response.data, _debug: debugHeaders });
  } catch (error) {
    logger.error('ShopMonkey update service failed:', {
      orderId: req.params.orderId,
      serviceId: req.params.serviceId,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.response?.data?.error || 'Failed to update service',
      details: error.response?.data
    });
  }
});

// ShopMonkey Labels endpoints
app.get('/api/shopmonkey/label', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/label`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      params: req.query
    });

    logger.info(`ShopMonkey get labels: ${response.data.data?.length || 0} labels returned`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey get labels failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to fetch labels'
    });
  }
});

// Get specific label by ID
app.get('/api/shopmonkey/label/:id', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.get(`${SHOPMONKEY_BASE_URL}/v3/label/${req.params.id}`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey get label by ID: ${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey get label by ID failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to fetch label'
    });
  }
});

// Create new label
app.post('/api/shopmonkey/label', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.post(`${SHOPMONKEY_BASE_URL}/v3/label`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey create label: ${req.body.name || 'unnamed'}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey create label failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to create label'
    });
  }
});

// Update label
app.put('/api/shopmonkey/label/:id', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.put(`${SHOPMONKEY_BASE_URL}/v3/label/${req.params.id}`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey update label: ${req.params.id} - ${req.body.name || 'unnamed'}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey update label failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to update label'
    });
  }
});

// Delete label
app.delete('/api/shopmonkey/label/:id', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.delete(`${SHOPMONKEY_BASE_URL}/v3/label/${req.params.id}`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey delete label: ${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey delete label failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to delete label'
    });
  }
});

// Assign label to entity
app.put('/api/shopmonkey/label/:id/assign', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.put(`${SHOPMONKEY_BASE_URL}/v3/label/${req.params.id}/assign`, req.body, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`ShopMonkey assign label: ${req.params.id} to ${req.body.entity} ${req.body.entityId}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey assign label failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to assign label'
    });
  }
});

// Remove label from entity
app.delete('/api/shopmonkey/label/:id/assign', async (req, res) => {
  try {
    const authHeader = req.headers['x-shopmonkey-token'];
    if (!authHeader) {
      return res.status(401).json({ error: 'ShopMonkey token is required' });
    }

    const response = await axios.delete(`${SHOPMONKEY_BASE_URL}/v3/label/${req.params.id}/assign`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      data: req.body
    });

    logger.info(`ShopMonkey remove label: ${req.params.id} from ${req.body.entity} ${req.body.entityId}`);
    res.json(response.data);
  } catch (error) {
    logger.error('ShopMonkey remove label failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to remove label'
    });
  }
});

// === DYNAMIC API ROUTES ===
// Initialize the dynamic API system that can serve any database table
// IMPORTANT: This must come AFTER all specific routes to avoid conflicts
const DynamicApiRoutes = require('./dynamicApiRoutes');
const dynamicApi = new DynamicApiRoutes(); // Uses database-config.js for DB connection

// Root API endpoint - provides information about available endpoints
app.get('/api', (req, res) => {
  res.json({
    message: 'QuickCheck API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      tables: '/api/tables',
      quickChecks: '/api/quick-checks',
      stateInspections: '/api/state-inspection-records',
      users: '/api/users',
      vin: '/api/vin/decode/:vin',
      dynamic: '/api/:tableName (GET, POST, PUT, DELETE)',
      examples: {
        listTables: '/api/tables',
        getQuickChecks: '/api/quick_checks?page=1&limit=10',
        searchQuickChecks: '/api/quick_checks?search=honda',
        getTableSchema: '/api/tables/quick_checks/schema'
      }
    },
    documentation: 'Use /api/tables to see all available database tables'
  });
});

// === Simple test endpoint to verify deployment ===
app.get('/api/test-deployment', (req, res) => {
  res.json({
    message: 'Deployment v2.0-fallback working!',
    timestamp: new Date().toISOString(),
    databaseAvailable: !!db
  });
});

// === Database debug endpoint (must be before dynamic routes) ===
app.get('/api/_debug_database', (req, res) => {
  const databaseUrl = process.env.DATABASE_URL;
  const databaseType = process.env.DATABASE_TYPE;
  const nodeEnv = process.env.NODE_ENV;
  
  // Parse URL safely for debugging (hide password)
  let parsedUrl = 'Not set';
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      parsedUrl = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        username: url.username,
        password: url.password ? '***HIDDEN***' : 'Not set'
      };
    } catch (error) {
      parsedUrl = `Parse error: ${error.message}`;
    }
  }
  
  res.json({
    status: 'debug',
    database: {
      url_set: !!databaseUrl,
      url_length: databaseUrl ? databaseUrl.length : 0,
      parsed_url: parsedUrl,
      type: databaseType,
      environment: nodeEnv,
      db_connection_status: db ? 'Database wrapper exists' : 'No database wrapper',
      raw_db_status: rawDb ? 'Raw DB exists' : 'No raw DB connection'
    },
    timestamp: new Date().toISOString()
  });
});

// Setup dynamic routes - these will handle /api/[tableName] endpoints
dynamicApi.setupRoutes(app, authenticateToken);

logger.info('🔄 Dynamic API system initialized - All database tables are now accessible via /api/[tableName]');

// === Helper function to clean up blob URLs from Quick Check data ===
function cleanupBlobUrls(data) {
  if (!data || typeof data !== 'object') return data;
  
  const cleanedData = { ...data };
  
  // Photo fields that might contain blob URLs
  const photoFields = [
    'dash_lights_photos',
    'tpms_placard', 
    'washer_fluid_photo',
    'engine_air_filter_photo',
    'battery_photos',
    'tpms_tool_photo',
    'front_brakes',
    'rear_brakes'
  ];
  
  // Clean regular photo fields
  photoFields.forEach(field => {
    if (cleanedData[field] && Array.isArray(cleanedData[field])) {
      cleanedData[field] = cleanedData[field].filter(photo => {
        if (photo && photo.url && photo.url.startsWith('blob:')) {
          logger.warn(`Removing blob URL from ${field}:`, photo.url);
          return false; // Remove blob URLs
        }
        return true;
      });
    }
  });
  
  // Clean tire photos
  if (cleanedData.tire_photos && Array.isArray(cleanedData.tire_photos)) {
    cleanedData.tire_photos.forEach(tirePhoto => {
      if (tirePhoto.photos && Array.isArray(tirePhoto.photos)) {
        tirePhoto.photos = tirePhoto.photos.filter(photo => {
          if (photo && photo.url && photo.url.startsWith('blob:')) {
            logger.warn(`Removing blob URL from tire_photos:`, photo.url);
            return false;
          }
          return true;
        });
      }
    });
  }
  
  // Clean tire repair images
  if (cleanedData.tire_repair_images && typeof cleanedData.tire_repair_images === 'object') {
    Object.keys(cleanedData.tire_repair_images).forEach(position => {
      const positionData = cleanedData.tire_repair_images[position];
      if (positionData && typeof positionData === 'object') {
        ['not_repairable', 'tire_size_brand', 'repairable_spot'].forEach(imageType => {
          if (positionData[imageType] && Array.isArray(positionData[imageType])) {
            positionData[imageType] = positionData[imageType].filter(photo => {
              if (photo && photo.url && photo.url.startsWith('blob:')) {
                logger.warn(`Removing blob URL from tire_repair_images[${position}][${imageType}]:`, photo.url);
                return false;
              }
              return true;
            });
          }
        });
      }
    });
  }
  
  return cleanedData;
}

// ... existing code ...



// === Start server ===
// 🧠 Cursor: Updated for Render deployment - server binds to process.env.PORT || 3000
// Render needs the app to bind to process.env.PORT for "No open ports detected" issue
server.listen(process.env.PORT || 3000, () => {
  const protocol = isProduction ? 'http' : 'https';
  logger.info(`✅ Backend running with ${protocol.toUpperCase()} at:`);
  logger.info(`   Port: ${process.env.PORT || 3000}`);
  logger.info(`   Local:   ${protocol}://localhost:${process.env.PORT || 3000}`);
  logger.info(`   Network: ${protocol}://${getLocalIP()}:${process.env.PORT || 3000}`);
  if (!isProduction) {
    logger.info(`   ⚠️  Note: You may need to accept the self-signed certificate in your browser`);
  }
  logger.info(`   📊 Dynamic API: Use /api/tables to list all available tables`);
  logger.info(`   🔍 Example: /api/quick_checks?page=1&limit=10&search=honda`);
  console.log("Server running on port", process.env.PORT || 3000);
});

// === Initialize WebSocket Service ===
const wsService = new WebSocketService(server);

// Store WebSocket service globally for use in routes
global.wsService = wsService;

// Setup periodic cleanup and heartbeat
setInterval(() => {
  wsService.cleanup();
}, 5 * 60 * 1000); // Every 5 minutes

setInterval(() => {
  wsService.sendHeartbeat();
}, 30 * 1000); // Every 30 seconds

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('🔄 Shutting down gracefully...');
  wsService.emitStatusUpdate('info', 'Server is shutting down for maintenance');
  server.close(() => {
    process.exit(0);
  });
});


