import { VinDecodedDetails } from '../types/stickers';

// Helper for formatting
const truncateDecimalValues = (value: string): string => {
    if (!value) return '';
    // If it looks like a number with decimal places
    if (/^\d+\.\d+$/.test(value)) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            // Keep up to 1 decimal place if needed, or remove if .0
            return Number(num.toFixed(1)).toString();
        }
    }
    return value;
};

export class VinDecoderService {
  static async decodeVin(vin: string): Promise<VinDecodedDetails> {
    try {
      if (!vin || vin.length !== 17) {
        throw new Error('Invalid VIN length. VIN must be 17 characters.');
      }

      // Clean the VIN (remove spaces and convert to uppercase)
      const cleanVin = vin.replace(/\s/g, '').toUpperCase();
      
      // Validate VIN format (17 alphanumeric characters, no I, O, Q)
      const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
      if (!vinRegex.test(cleanVin)) {
        throw new Error('Invalid VIN format. VIN contains invalid characters.');
      }

      // Call NHTSA API directly (CORS enabled)
      const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${cleanVin}?format=json`);
      
      if (!response.ok) {
        throw new Error(`VIN decode request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.Results || data.Results.length === 0) {
        throw new Error('No vehicle data found for this VIN');
      }

      // Helper function to extract value by variable name with decimal truncation
      const getValue = (variable: string): string => {
        const found = data.Results.find((r: any) => r.Variable === variable);
        const rawValue = found && found.Value && found.Value !== 'Not Applicable' && found.Value !== '0' ? found.Value : '';
        return truncateDecimalValues(rawValue);
      };

      return {
        make: getValue('Make'),
        model: getValue('Model'),
        year: getValue('Model Year'),
        engine: getValue('Engine Configuration'),
        engineL: getValue('Displacement (L)'),
        engineCylinders: getValue('Engine Number of Cylinders'),
        trim: getValue('Trim'),
        bodyType: getValue('Body Class'),
        bodyClass: getValue('Body Class'),
        driveType: getValue('Drive Type'),
        transmission: getValue('Transmission Style'),
        fuelType: getValue('Fuel Type - Primary'),
        manufacturer: getValue('Manufacturer Name'),
        plant: getValue('Plant Company Name'),
        vehicleType: getValue('Vehicle Type'),
      };
    } catch (error) {
      console.error('VIN decode error:', error);
      return {
        error: error instanceof Error ? error.message : 'Failed to decode VIN'
      };
    }
  }

  static validateVin(vin: string): boolean {
    if (!vin || vin.length !== 17) return false;
    const cleanVin = vin.replace(/\s/g, '').toUpperCase();
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
    return vinRegex.test(cleanVin);
  }

  static formatVin(vin: string): string {
    return vin.replace(/\s/g, '').toUpperCase();
  }
} 