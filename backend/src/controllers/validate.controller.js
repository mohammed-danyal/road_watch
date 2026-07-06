const axios = require('axios');
const FormData = require('form-data');

const AI_SERVICE_BASE = process.env.AI_SERVICE_URL ? process.env.AI_SERVICE_URL.replace(/\/api\/v1\/analyze\/?$/, '') : 'http://localhost:8000';
const AI_VALIDATE_URL = `${AI_SERVICE_BASE}/api/v1/validate-road-image`;

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

      const retryAfter = err.response?.headers?.['retry-after'];
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : baseDelayMs * Math.pow(2, attempt);

      console.warn(`⏳ Validation service returned ${status}, retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delayMs);
    }
  }
};

/**
 * Validate whether the uploaded image is road/infrastructure related.
 *
 * Proxies the image to the FastAPI AI service validation endpoint.
 * Falls back to { isValid: true } if the AI service is unreachable,
 * so existing functionality is NEVER broken by service downtime.
 */
exports.validateRoadImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        isValid: false,
        message: 'No image provided for validation.',
      });
    }

    // Forward image buffer to the FastAPI validation endpoint
    const formData = new FormData();
    formData.append('image', req.file.buffer, {
      filename:    req.file.originalname || 'upload.jpg',
      contentType: req.file.mimetype     || 'image/jpeg',
    });

    const aiRes = await axiosWithRetry({
      method: 'post',
      url: AI_VALIDATE_URL,
      data: formData,
      headers: { ...formData.getHeaders() },
      timeout: 60000, // 60 s — allow Render AI service to wake up from cold start
    });

    const { is_valid, class_name, confidence, message } = aiRes.data;

    return res.json({
      success:    true,
      isValid:    is_valid,
      className:  class_name,
      confidence: confidence,
      message:    message,
    });

  } catch (err) {
    // AI service unavailable → fail-open so existing workflow is unaffected
    console.warn('⚠️  Image validation service unavailable, allowing through:', err.message);
    return res.json({
      success:   true,
      isValid:   true,
      className: 'unknown',
      confidence: 0,
      message:   'Validation service unavailable — proceeding.',
    });
  }
};
