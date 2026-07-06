const axios = require('axios');
const FormData = require('form-data');
const Location = require('../models/Location');
const Road = require('../models/Road');
const RoadDamage = require('../models/RoadDamage');

const AI_SERVICE_BASE = process.env.AI_SERVICE_URL ? process.env.AI_SERVICE_URL.replace(/\/api\/v1\/analyze\/?$/, '') : 'http://localhost:8000';
const AI_SERVICE_URL = `${AI_SERVICE_BASE}/api/v1/analyze`;

// Retry helper with exponential backoff for 429 (rate-limit) and 5xx errors
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const axiosWithRetry = async (config, { maxRetries = 3, baseDelayMs = 2000 } = {}) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios(config);
    } catch (err) {
      const status = err.response?.status;
      const isRetryable = status === 429 || (status >= 500 && status < 600);

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      // Respect Retry-After header if present, otherwise use exponential backoff
      const retryAfter = err.response?.headers?.['retry-after'];
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : baseDelayMs * Math.pow(2, attempt);

      console.warn(`⏳ AI service returned ${status}, retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delayMs);
    }
  }
};

// Maps Overpass highway tag → human-readable road type (matching the 6-category database schema)
const mapRoadType = (highwayTag) => {
  const tag = (highwayTag || '').toLowerCase().trim();
  if (tag.startsWith('motorway') || tag.startsWith('trunk')) {
    return 'National Highway (NH)';
  }
  if (tag.startsWith('primary')) {
    return 'State Highway (SH)';
  }
  if (tag.startsWith('secondary')) {
    return 'Major District Road (MDR) / Urban Arterial Road';
  }
  if (tag.startsWith('tertiary')) {
    return 'Other District Road (ODR)';
  }
  if (tag.startsWith('residential') || tag.startsWith('service') || tag.startsWith('unclassified')) {
    return 'Local Road';
  }
  if (tag.startsWith('track')) {
    return 'Rural Access Road / Village Road';
  }
  return 'Local Road'; // Fallback matching the new database schema
};

// Maps Overpass/Nominatim highway tag → detailed human-readable road classification (additional layer)
const mapDetailedRoadClassification = (highwayTag) => {
  const tag = (highwayTag || '').toLowerCase().trim();
  if (!tag || tag === 'unknown') {
    return 'Unknown Road Category';
  }
  if (tag.startsWith('motorway') || tag.startsWith('trunk')) {
    return 'National Highway (NH)';
  }
  if (tag.startsWith('primary')) {
    return 'State Highway (SH)';
  }
  if (tag.startsWith('secondary')) {
    return 'Major District Road (MDR) / Urban Arterial Road';
  }
  if (tag.startsWith('tertiary')) {
    return 'Other District Road (ODR)';
  }
  if (tag.startsWith('residential') || tag.startsWith('service') || tag.startsWith('unclassified')) {
    return 'Local Road';
  }
  if (tag.startsWith('track')) {
    return 'Rural Access Road / Village Road';
  }
  return 'Unknown Road Category';
};

// Formats a date value to YYYY-MM-DD string for the AI service
const toDateString = (dateVal) => {
  try {
    return new Date(dateVal).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

exports.processAnalysis = async (req, res) => {
  try {
    // ── Step 1 & 2: Receive coordinates + optional location string from frontend ──
    const lat = parseFloat(req.body.lat);
    const lng = parseFloat(req.body.lng);
    const locationString = req.body.locationString || null;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // ── Step 4: Call Nominatim API (Primary) to detect road type and name ──
    let highwayTag = 'unknown';
    let roadName = 'Unnamed Road';
    let nominatimSuccess = false;

    try {
      console.info(`📡 Querying Nominatim for road classification at coordinates: (${lat}, ${lng})...`);
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17`;
      const nominatimRes = await axios.get(nominatimUrl, {
        timeout: 4000,
        headers: { 'User-Agent': 'RoadWatch/1.0 (road-transparency-app)' }
      });
      if (nominatimRes.data) {
        const data = nominatimRes.data;
        if (data.category === 'highway' || data.type) {
          highwayTag = data.type || 'unknown';
        }
        roadName = data.name || (data.address && (data.address.road || data.address.pedestrian)) || 'Unnamed Road';
        nominatimSuccess = true;
        console.info(`✅ Nominatim primary geocoding success: "${roadName}" (${highwayTag})`);
      }
    } catch (nominatimErr) {
      console.warn(`⚠️ Nominatim query failed:`, nominatimErr.message);
    }

    // ── Backup Fallback: If Nominatim fails, try Overpass API mirrors ──
    if (!nominatimSuccess) {
      console.info('⚠️ Nominatim failed, attempting Overpass API mirrors as backup...');
      const overpassUrls = [
        `https://overpass-api.de/api/interpreter?data=[out:json];way(around:20,${lat},${lng})[highway];out tags;`,
        `https://lz4.overpass-api.de/api/interpreter?data=[out:json];way(around:20,${lat},${lng})[highway];out tags;`,
        `https://z.overpass-api.de/api/interpreter?data=[out:json];way(around:20,${lat},${lng})[highway];out tags;`,
        `https://overpass.kumi.systems/api/interpreter?data=[out:json];way(around:20,${lat},${lng})[highway];out tags;`,
        `https://overpass.nchc.org.tw/api/interpreter?data=[out:json];way(around:20,${lat},${lng})[highway];out tags;`
      ];

      let overpassData = null;
      for (const url of overpassUrls) {
        try {
          const overpassRes = await axios.get(url, {
            timeout: 4000,
            headers: { 'User-Agent': 'RoadWatch/1.0 (road-transparency-app)' }
          });
          if (overpassRes.data && overpassRes.data.elements) {
            overpassData = overpassRes.data;
            break;
          }
        } catch (overpassErr) {
          console.info(`ℹ️ Overpass API mirror busy/failed (${url}):`, overpassErr.message);
        }
      }

      if (overpassData && overpassData.elements.length > 0) {
        const tags = overpassData.elements[0].tags;
        highwayTag = tags.highway || 'unknown';
        roadName = tags.name || tags['name:en'] || tags['name:local'] || 'Unnamed Road';
        console.info(`✅ Overpass fallback success: "${roadName}" (${highwayTag})`);
      } else {
        console.warn('⚠️ All Overpass API mirrors also failed or returned empty results, using default values.');
      }
    }

    // ── Step 5: Map highway tag → road type ──
    const mappedRoadType = mapRoadType(highwayTag);
    const detailedClassification = mapDetailedRoadClassification(highwayTag);

    // ── Step 6: Fetch matching transparency data from BackendCluster ──
    const matchingRoadData = await Road.aggregate([
      { $match: { roadType: mappedRoadType } },
      { $sample: { size: 1 } }
    ]);
    const roadInfo = matchingRoadData.length > 0 ? matchingRoadData[0] : null;

    // ── Step 7: Forward image to Real AI Service (FastAPI + YOLOv8) ──
    let aiResult = null;

    if (req.file && req.file.buffer) {
      try {
        const formData = new FormData();

        // Attach the image buffer received from the frontend
        formData.append('image', req.file.buffer, {
          filename: req.file.originalname || 'road-image.jpg',
          contentType: req.file.mimetype || 'image/jpeg'
        });

        // Provide road context from Overpass + MongoDB to the AI
        const authority = roadInfo?.authority || 'Local Municipal Corporations';
        const lastRelayingDate = roadInfo?.lastRelayingDate
          ? toDateString(roadInfo.lastRelayingDate)
          : toDateString(new Date());

        formData.append('location', locationString || `${lat},${lng}`);
        formData.append('authority', authority);
        formData.append('road_type', mappedRoadType);
        formData.append('last_relaying_date', lastRelayingDate);
        formData.append('support_count', '1');

        const aiRes = await axiosWithRetry({
          method: 'post',
          url: AI_SERVICE_URL,
          data: formData,
          headers: { ...formData.getHeaders() },
          timeout: 90000 // 90 s — allow Render AI service to wake up from cold start
        });

        aiResult = aiRes.data;
        console.log(`✅ AI analysis complete — damage: ${aiResult.damage_type}, severity: ${aiResult.severity}`);

      } catch (aiErr) {
        console.error('⚠️  AI service error (using fallback):', aiErr.message);
      }
    } else {
      console.warn('⚠️  No image received — AI analysis skipped');
    }

    // ── Fallback AI values if AI service is unavailable or no image was sent ──
    const issueType = aiResult?.damage_type || 'Unknown';
    const severity = aiResult?.severity || 'Unknown';
    const condition = aiResult?.severity || 'Unknown';

    // ── Duplicate Issue Detection & Proximity Logic ──
    // Detect if there's a location within ~150 meters (0.0015 delta)
    const nearbyLocations = await Location.find({
      latitude: { $gte: lat - 0.0015, $lte: lat + 0.0015 },
      longitude: { $gte: lng - 0.0015, $lte: lng + 0.0015 }
    }).lean();

    const nearbyLocationIds = nearbyLocations.map(l => l._id);

    // Look for existing complaint of the same road damage type and road type
    const existingComplaint = await RoadDamage.findOne({
      locationId: { $in: nearbyLocationIds },
      roadType: mappedRoadType,
      $or: [
        { issueType: issueType },
        { roadDamage: issueType }
      ]
    });

    if (existingComplaint) {
      // Duplicate detected! Increment existing complaint supportCount/vote
      existingComplaint.supportCount = (existingComplaint.supportCount || 1) + 1;
      if (!existingComplaint.roadDamage) existingComplaint.roadDamage = issueType;
      if (!existingComplaint.roadType) existingComplaint.roadType = mappedRoadType;
      if (!existingComplaint.authority) existingComplaint.authority = roadInfo?.authority || 'Local Municipal Corporations';
      await existingComplaint.save();

      const matchedLoc = nearbyLocations.find(l => l._id.toString() === existingComplaint.locationId.toString()) || {};

      console.log(`🔄 Duplicate detected: Incrementing supportCount to ${existingComplaint.supportCount} for complaint ${existingComplaint._id}`);

      return res.json({
        success: true,
        duplicateDetected: true,
        message: "This issue has already been reported.\nYour submission has been counted as a support vote for this issue.",
        data: {
          _id: existingComplaint._id,
          id: `#RW-${existingComplaint._id.toString().slice(-4).toUpperCase()}`,
          location: matchedLoc.location || locationString || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          roadName,
          highwayTag,
          roadType: mappedRoadType,
          detailedClassification,
          contractor: roadInfo?.contractor || 'Unknown',
          budgetAllocated: roadInfo?.budgetAllocated || 'N/A',
          amountSpent: roadInfo?.amountSpent || 'N/A',
          lastRelayingDate: roadInfo?.lastRelayingDate || 'N/A',
          authority: roadInfo?.authority || 'Unknown',
          issueType,
          severity: existingComplaint.severity || severity,
          condition: existingComplaint.condition || condition,
          roadDamage: issueType,
          confidence: aiResult?.confidence ?? null,
          priorityLevel: aiResult?.priority_level || null,
          priorityScore: aiResult?.priority_score_normalized ?? null,
          severityScore: aiResult?.severity_score ?? null,
          roadHealthIndex: aiResult?.road_health_index ?? null,
          summary: aiResult?.summary || null,
          report: aiResult?.report || null,
          aiConnected: aiResult !== null,
          supportCount: existingComplaint.supportCount,
          status: existingComplaint.status || 'Pending'
        }
      });
    }

    // ── No Duplicate Found: Create new complaint and location records ──
    const locationDoc = await Location.create({
      latitude: lat,
      longitude: lng,
      location: locationString || null
    });

    const newComplaint = await RoadDamage.create({
      locationId: locationDoc._id,
      issueType,
      severity,
      condition,
      roadDamage: issueType,
      roadType: mappedRoadType,
      supportCount: 1,
      status: 'Pending',
      authority: roadInfo?.authority || 'Local Municipal Corporations',
      submittedDate: new Date()
    });

    // Return combined response to frontend
    res.json({
      success: true,
      duplicateDetected: false,
      data: {
        _id: newComplaint._id,
        id: `#RW-${newComplaint._id.toString().slice(-4).toUpperCase()}`,
        location: locationString || null,
        roadName,
        highwayTag,
        roadType: mappedRoadType,
        detailedClassification,
        contractor: roadInfo?.contractor || 'Unknown',
        budgetAllocated: roadInfo?.budgetAllocated || 'N/A',
        amountSpent: roadInfo?.amountSpent || 'N/A',
        lastRelayingDate: roadInfo?.lastRelayingDate || 'N/A',
        authority: roadInfo?.authority || 'Unknown',
        issueType,
        severity,
        condition,
        roadDamage: issueType,
        confidence: aiResult?.confidence ?? null,
        priorityLevel: aiResult?.priority_level || null,
        priorityScore: aiResult?.priority_score_normalized ?? null,
        severityScore: aiResult?.severity_score ?? null,
        roadHealthIndex: aiResult?.road_health_index ?? null,
        summary: aiResult?.summary || null,
        report: aiResult?.report || null,
        aiConnected: aiResult !== null,
        supportCount: 1,
        status: 'Pending'
      }
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Server error processing analysis' });
  }
};

