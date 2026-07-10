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
    // IMPORTANT: AI analysis is fully isolated — any failure here (429, timeout,
    // network error, FormData construction error, response parsing error) ONLY
    // affects AI-related fields. GPS processing, road classification, MongoDB
    // lookups, and all transparency data continue regardless.
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
        // AI failure is non-fatal: log and continue with fallback AI values.
        // Road transparency data (contractor, authority, budget, relaying date)
        // is NEVER affected by AI failures — it comes from MongoDB, not AI.
        const statusCode = aiErr.response?.status;
        const reason = statusCode
          ? `HTTP ${statusCode}${statusCode === 429 ? ' (rate limited)' : ''}`
          : (aiErr.code === 'ECONNABORTED' ? 'timeout' : aiErr.code || 'unavailable');
        console.error(`⚠️  AI service error [${reason}] — using fallback AI values. Road transparency data unaffected.`);
        console.error(`   AI error details: ${aiErr.message}`);
        // aiResult remains null → fallback AI values will be used below
      }
    } else {
      console.warn('⚠️  No image received — AI analysis skipped. Road transparency data unaffected.');
    }

    // ── Fallback AI values if AI service is unavailable or no image was sent ──
    // ONLY these AI-derived fields use fallback defaults. All non-AI fields
    // (roadInfo, contractor, authority, budget, lastRelayingDate) continue to
    // use real values fetched from MongoDB in Step 6 above.
    const issueType = aiResult?.damage_type || 'Unknown';
    const severity = aiResult?.severity || 'Unknown';
    const condition = aiResult?.severity || 'Unknown';

    // Determine fallback AI test score/road health index based on severity
    let fallbackTestScore = 70;
    const sevLower = (severity || '').toLowerCase();
    if (sevLower === 'critical') fallbackTestScore = 25;
    else if (sevLower === 'high') fallbackTestScore = 40;
    else if (sevLower === 'medium' || sevLower === 'moderate') fallbackTestScore = 65;
    else if (sevLower === 'low') fallbackTestScore = 85;

    if (!aiResult) {
      console.info('ℹ️  AI fallback active — using default AI values (damage: Unknown, severity: Unknown). Continuing with real road transparency data from MongoDB.');
    }

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

      // ── Refresh existing complaint with latest verified data ──
      // Always update road condition and infrastructure fields so the
      // complaint record stays current. Preserved: _id, locationId,
      // submittedDate, status (these are never overwritten).
      existingComplaint.issueType  = issueType;
      existingComplaint.severity   = severity;
      existingComplaint.condition  = condition;
      existingComplaint.roadDamage = issueType;
      existingComplaint.roadType   = mappedRoadType;
      existingComplaint.authority  = roadInfo?.authority || existingComplaint.authority || 'Local Municipal Corporations';
      existingComplaint.contractor      = roadInfo?.contractor || existingComplaint.contractor || 'Unknown';
      existingComplaint.budgetAllocated = roadInfo?.budgetAllocated || existingComplaint.budgetAllocated || 'N/A';
      existingComplaint.amountSpent     = roadInfo?.amountSpent || existingComplaint.amountSpent || 'N/A';
      existingComplaint.lastRelayingDate = roadInfo?.lastRelayingDate || existingComplaint.lastRelayingDate || null;
      existingComplaint.roadName        = roadName || existingComplaint.roadName || 'Unnamed Road';
      existingComplaint.confidence      = aiResult?.confidence ?? existingComplaint.confidence ?? null;
      existingComplaint.updatedAt       = new Date();

      // Fetch latest test score from testscore collection or AI results
      const TestScore = require('../models/TestScore');
      const testScoreDoc = await TestScore.findOne({ locationId: existingComplaint.locationId }).sort({ _id: -1 });
      existingComplaint.testScore = testScoreDoc ? testScoreDoc.testScore : (aiResult?.road_health_index ?? fallbackTestScore);
      existingComplaint.fullAddress = locationString || matchedLoc.location || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

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
          location: existingComplaint.fullAddress || matchedLoc.location || locationString || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          roadName: existingComplaint.roadName,
          highwayTag,
          roadType: existingComplaint.roadType,
          detailedClassification,
          contractor: existingComplaint.contractor,
          budgetAllocated: existingComplaint.budgetAllocated,
          amountSpent: existingComplaint.amountSpent,
          lastRelayingDate: existingComplaint.lastRelayingDate,
          authority: existingComplaint.authority,
          issueType: existingComplaint.issueType,
          severity: existingComplaint.severity,
          condition: existingComplaint.condition,
          roadDamage: existingComplaint.roadDamage,
          confidence: existingComplaint.confidence,
          priorityLevel: aiResult?.priority_level || null,
          priorityScore: aiResult?.priority_score_normalized ?? null,
          severityScore: aiResult?.severity_score ?? null,
          roadHealthIndex: existingComplaint.testScore,
          testScore: existingComplaint.testScore,
          fullAddress: existingComplaint.fullAddress,
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

    // Fetch latest test score from testscore collection or AI results
    const TestScore = require('../models/TestScore');
    const testScoreDoc = await TestScore.findOne({ locationId: locationDoc._id }).sort({ _id: -1 });

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
      submittedDate: new Date(),
      contractor:      roadInfo?.contractor || 'Unknown',
      budgetAllocated: roadInfo?.budgetAllocated || 'N/A',
      amountSpent:     roadInfo?.amountSpent || 'N/A',
      lastRelayingDate: roadInfo?.lastRelayingDate || null,
      roadName:        roadName || 'Unnamed Road',
      confidence:      aiResult?.confidence ?? null,
      updatedAt:       new Date(),
      testScore:       testScoreDoc ? testScoreDoc.testScore : (aiResult?.road_health_index ?? fallbackTestScore),
      fullAddress:     locationString || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    });

    // Return combined response to frontend
    res.json({
      success: true,
      duplicateDetected: false,
      data: {
        _id: newComplaint._id,
        id: `#RW-${newComplaint._id.toString().slice(-4).toUpperCase()}`,
        location: newComplaint.fullAddress || locationString || null,
        roadName: newComplaint.roadName,
        highwayTag,
        roadType: newComplaint.roadType,
        detailedClassification,
        contractor: newComplaint.contractor,
        budgetAllocated: newComplaint.budgetAllocated,
        amountSpent: newComplaint.amountSpent,
        lastRelayingDate: newComplaint.lastRelayingDate,
        authority: newComplaint.authority,
        issueType: newComplaint.issueType,
        severity: newComplaint.severity,
        condition: newComplaint.condition,
        roadDamage: newComplaint.roadDamage,
        confidence: newComplaint.confidence,
        priorityLevel: aiResult?.priority_level || null,
        priorityScore: aiResult?.priority_score_normalized ?? null,
        severityScore: aiResult?.severity_score ?? null,
        roadHealthIndex: newComplaint.testScore,
        testScore: newComplaint.testScore,
        fullAddress: newComplaint.fullAddress,
        summary: aiResult?.summary || null,
        report: aiResult?.report || null,
        aiConnected: aiResult !== null,
        supportCount: newComplaint.supportCount,
        status: newComplaint.status
      }
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Server error processing analysis' });
  }
};

