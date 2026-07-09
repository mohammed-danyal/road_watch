const express = require('express');
const router = express.Router();
const multer = require('multer');
const processController = require('../controllers/process.controller');
const validateController = require('../controllers/validate.controller');

// Multer — store image in memory so we can forward the buffer to the AI service
const upload = multer({ storage: multer.memoryStorage() });

// Main POST route — accepts multipart/form-data with an optional image file
router.post('/analyze-road', upload.single('image'), processController.processAnalysis);

// Image validation route — call BEFORE /analyze-road to pre-screen uploads
router.post('/validate-image', upload.single('image'), validateController.validateRoadImage);

// Route for storing readable location
router.post('/location', async (req, res) => {
  try {
    const Location = require('../models/Location');
    const { location, latitude, longitude } = req.body;
    const newLocation = new Location({ location, latitude, longitude });
    await newLocation.save();
    res.status(200).json({ success: true, data: newLocation });
  } catch (error) {
    console.error("Error saving location:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route for retrieving all submitted reports with mapped location and support counts
router.get('/reports', async (req, res) => {
  try {
    const RoadDamage = require('../models/RoadDamage');
    const Location = require('../models/Location');
    
    const damages = await RoadDamage.find().sort({ submittedDate: -1 }).lean();
    const locationIds = damages.map(d => d.locationId).filter(Boolean);
    const locations = await Location.find({ _id: { $in: locationIds } }).lean();
    
    const locationMap = {};
    locations.forEach(loc => {
      locationMap[loc._id.toString()] = loc;
    });

    const reports = damages.map(d => {
      const loc = locationMap[d.locationId?.toString()] || {};
      return {
        id: `#RW-${d._id.toString().slice(-4).toUpperCase()}`,
        _id: d._id,
        issueType:    d.issueType    || d.roadDamage || 'Pothole',
        roadDamage:   d.roadDamage   || d.issueType  || 'Pothole',
        roadType:     d.roadType     || 'Other Road',
        location: d.fullAddress || loc.location || (loc.latitude ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : 'Coordinates: Lat/Lng'),
        latitude:     loc.latitude,
        longitude:    loc.longitude,
        status:       d.status       || 'Pending',
        supportCount: d.supportCount || 1,
        authority:    d.authority    || 'Local Municipal Corporations',
        submittedDate: d.submittedDate || loc.timestamp || new Date(),
        severity:     d.severity     || 'Unknown',
        condition:    d.condition    || 'Unknown',
        contractor:      d.contractor      || 'Unknown',
        budgetAllocated: d.budgetAllocated || 'N/A',
        amountSpent:     d.amountSpent     || 'N/A',
        lastRelayingDate: d.lastRelayingDate || null,
        roadName:        d.roadName        || 'Unnamed Road',
        confidence:      d.confidence      ?? null,
        updatedAt:       d.updatedAt       || null,
        testScore:       d.testScore       ?? null,
        fullAddress:     d.fullAddress     || loc.location || null
      };
    });

    res.json({ success: true, data: reports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route for retrieving a single report by ID directly from MongoDB (cache bypass)
router.get('/reports/:id', async (req, res) => {
  try {
    const RoadDamage = require('../models/RoadDamage');
    const Location = require('../models/Location');
    const { id } = req.params;

    const d = await RoadDamage.findById(id).lean();
    if (!d) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    const loc = d.locationId ? await Location.findById(d.locationId).lean() : {};

    const report = {
      id: `#RW-${d._id.toString().slice(-4).toUpperCase()}`,
      _id: d._id,
      issueType:    d.issueType    || d.roadDamage || 'Pothole',
      roadDamage:   d.roadDamage   || d.issueType  || 'Pothole',
      roadType:     d.roadType     || 'Other Road',
      location: d.fullAddress || (loc ? loc.location : null) || (loc && loc.latitude ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : 'Coordinates: Lat/Lng'),
      latitude:     loc ? loc.latitude : null,
      longitude:    loc ? loc.longitude : null,
      status:       d.status       || 'Pending',
      supportCount: d.supportCount || 1,
      authority:    d.authority    || 'Local Municipal Corporations',
      submittedDate: d.submittedDate || (loc ? loc.timestamp : null) || new Date(),
      severity:     d.severity     || 'Unknown',
      condition:    d.condition    || 'Unknown',
      contractor:      d.contractor      || 'Unknown',
      budgetAllocated: d.budgetAllocated || 'N/A',
      amountSpent:     d.amountSpent     || 'N/A',
      lastRelayingDate: d.lastRelayingDate || null,
      roadName:        d.roadName        || 'Unnamed Road',
      confidence:      d.confidence      ?? null,
      updatedAt:       d.updatedAt       || null,
      testScore:       d.testScore       ?? null,
      fullAddress:     d.fullAddress     || (loc ? loc.location : null) || null
    };

    res.json({ success: true, data: report });
  } catch (error) {
    console.error("Error fetching report by ID:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

