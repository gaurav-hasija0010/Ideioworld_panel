'use strict';

/**
 * Ideioworld Panel configuration.
 * All values can be overridden with environment variables so nothing
 * sensitive has to be hard-coded when you deploy on a real machine.
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  port: Number(process.env.PORT) || 4000,

  // Login (single shared account). Change these before real use.
  auth: {
    username: process.env.IDEIO_USER || 'admin',
    password: process.env.IDEIO_PASSWORD || 'ideioworld',
  },

  // Session secret — override in production via IDEIO_SECRET.
  sessionSecret: process.env.IDEIO_SECRET || 'ideioworld-local-secret-change-me',

  paths: {
    root: ROOT,
    data: path.join(ROOT, 'data'),
    db: path.join(ROOT, 'data', 'ideioworld.db'),
    uploads: path.join(ROOT, 'uploads'),
    public: path.join(ROOT, 'public'),
  },

  // Dropdown option sets used across the app.
  options: {
    categories: [
      'Restaurant', 'Cafe', 'Grocery', 'Retail', 'Fashion & Apparel',
      'Electronics', 'Mobile & Accessories', 'Salon & Spa', 'Gym & Fitness',
      'Healthcare & Clinic', 'Pharmacy', 'Education & Coaching', 'Automobile',
      'Real Estate', 'Hotel & Hospitality', 'Travel & Tourism', 'Services',
      'Hardware', 'Bakery', 'Other',
    ],
    businessTypes: [
      'Proprietorship', 'Partnership', 'Private Limited', 'LLP',
      'Public Limited', 'Franchise', 'Freelancer / Individual', 'Other',
    ],
    statuses: ['New Lead', 'Contacted', 'Interested', 'Onboarded', 'Not Interested'],
    mobility: ['Permanent', 'Moves around'],
  },
};
