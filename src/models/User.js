const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  platformCredentials: {
    zomato: {
      phoneNumber: String,
      otp: String
    },
    swiggy: {
      phoneNumber: String,
      otp: String
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  zomatoCredentials: {
    email: String,
    password: String
  },
  swiggyCredentials: {
    phoneNumber: String
  },
  preferences: {
    notifications: {
      type: Boolean,
      default: true
    },
    emissionAlerts: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User; 