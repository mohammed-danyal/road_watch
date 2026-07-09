const mongoose = require('mongoose');
const { aiDB } = require('../config/db');

const roadDamageSchema = new mongoose.Schema({
  locationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  issueType:    { type: String, required: true },
  severity:     { type: String, required: true },
  condition:    { type: String, required: true },
  roadDamage:   { type: String },
  roadType:     { type: String },
  supportCount: { type: Number, default: 1 },
  status:       { type: String, default: 'Pending' },
  authority:    { type: String },
  submittedDate: { type: Date, default: Date.now },
  contractor:      { type: String },
  budgetAllocated: { type: String },
  amountSpent:     { type: String },
  lastRelayingDate:{ type: Date },
  roadName:        { type: String },
  confidence:      { type: Number },
  updatedAt:       { type: Date },
  testScore:       { type: Number },
  fullAddress:     { type: String }
}, { collection: 'roaddamage' });

module.exports = aiDB.model('RoadDamage', roadDamageSchema);
