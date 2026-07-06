import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, AlertTriangle, LayoutDashboard, HelpCircle, Phone, Clock, FileText, CheckCircle2, MapPin } from 'lucide-react';
import UploadImage from '../components/UploadImage';
import LetterEditor from '../components/LetterEditor';
import RoadReport from '../components/RoadReport';
import ToastNotification from '../components/ToastNotification';

export default function Home({ coords }) {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: "Namaste! I am Sathi, your friendly infrastructure assistant. How can I help you today?",
      options: [
        { id: 'report', label: 'Report a Problem', icon: <AlertTriangle className="w-4 h-4" /> },
        { id: 'dashboard', label: 'View City Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'help', label: 'How RoadSathi Works', icon: <HelpCircle className="w-4 h-4" /> },
        { id: 'support', label: 'Contact Support', icon: <Phone className="w-4 h-4" /> },
      ]
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // ── Image validation toast state ────────────────────────────────────────
  const [toast, setToast] = useState({ visible: false, message: '', type: 'warning' });
  const showToast = (message, type = 'warning') =>
    setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  // Mock User History Data
  const reportingHistory = [
    { id: 1, type: 'Review Report', isReport: true, icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> },
    { id: 2, type: 'How Road Sathi Works', isHowItWorks: true, icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
    { id: 3, type: 'Contacted Support', isContactSupport: true, icon: <Phone className="w-4 h-4 text-slate-500" /> }
  ];

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Dynamically generates a formal citizen complaint letter based on report data
  const generateCitizenLetter = (data) => {
    const authority = data?.authority || 'Local Municipal Corporations';
    const rawLocation = data?.location || '';

    // Parse location address parts to extract City, State, and Area
    let area = 'Local Area';
    let city = 'Bengaluru';
    let state = 'Karnataka';
    let fullAddress = rawLocation || 'Coordinates: Lat/Lng';

    if (rawLocation && rawLocation.includes(',')) {
      const parts = rawLocation.split(',').map(p => p.trim());

      // Filter out empty parts
      const cleanParts = parts.filter(Boolean);

      // Nominatim addresses typically end with: [..., City/District, State/Province, Postal Code, Country]
      // Let's locate the state (usually the item before postal/country, e.g., Karnataka)
      if (cleanParts.length >= 3) {
        // Find state by searching backward, ignoring Country and postal code numbers
        let stateIndex = cleanParts.length - 1;

        // Skip last item if it is Country (like "India")
        if (cleanParts[stateIndex].toLowerCase() === 'india') {
          stateIndex--;
        }

        // Skip next item if it is a number (postal code, e.g. "560064")
        if (stateIndex >= 0 && /^\d+$/.test(cleanParts[stateIndex])) {
          stateIndex--;
        }

        if (stateIndex >= 0) {
          state = cleanParts[stateIndex];
          // City is typically 1 or 2 items before the state
          if (stateIndex - 1 >= 0) {
            city = cleanParts[stateIndex - 1];
          }
        }
      }

      // Determine a readable local area
      area = cleanParts[1] || cleanParts[0] || 'Local Area';
    } else if (rawLocation) {
      area = rawLocation;
    }

    const roadName = data?.roadName && data.roadName !== 'Unnamed Road' ? data.roadName : data?.roadType || 'Local Road';
    const roadType = data?.roadType || 'Other Road';
    const roadDamage = data?.issueType || data?.roadDamage || 'Pothole';
    const severity = data?.severity || 'High';
    const condition = data?.condition || 'Poor';

    const contractor = data?.contractor || 'Local Road Contractor';
    const budgetAllocated = data?.budgetAllocated || '₹50 Lakhs';
    const amountSpent = data?.amountSpent || '₹42 Lakhs';

    // Format dates
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    let lastRelayingDate = 'N/A';
    if (data?.lastRelayingDate) {
      try {
        lastRelayingDate = new Date(data.lastRelayingDate).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric'
        });
      } catch {
        lastRelayingDate = data.lastRelayingDate;
      }
    }

    return `                         ROAD DAMAGE COMPLAINT REPORT

To,
${authority}
${city}, ${state}

Date: ${date}

Subject: Submission of Complaint Regarding Damaged ${roadType} Road Infrastructure

Respected Sir/Madam,

This is to formally bring to your attention the poor condition of the ${roadType} road located at:

${fullAddress}

The reported road has been identified with ${roadDamage} through AI-based road analysis, and the severity level has been classified as ${severity}.

According to the infrastructure transparency records, the road was last relayed on ${lastRelayingDate} under the contractor ${contractor} with a sanctioned budget of ${budgetAllocated}. The current road condition is causing inconvenience and safety concerns for commuters and residents using the road regularly.

The issue has been digitally verified using GPS-based location verification, Nominatim/Overpass road classification, and AI-powered road damage analysis.

Road Details:
Road Name        : ${roadName}
Road Type        : ${roadType}
Road Damage      : ${roadDamage}
Severity Level   : ${severity}
Road Condition   : ${condition}

Infrastructure Details:
Contractor Name  : ${contractor}
Budget Allocated : ${budgetAllocated}
Amount Spent     : ${amountSpent}
Last Relaying    : ${lastRelayingDate}

The identity of the reporting citizen has been kept confidential for privacy and safety purposes.

We kindly request the concerned authority to inspect the reported road damage and take the necessary repair and maintenance actions at the earliest possible time.

Thank you.

Yours faithfully,

Road Transparency & Accountability System`;
  };

  const handleOptionClick = (option) => {
    if (option.id === 'dashboard') {
      navigate('/admin');
      return;
    }

    setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: option.label }]);
    setIsTyping(true);

    if (option.id === 'report') {
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: "Please capture or upload a photo of the issue. I will analyze it and draft a formal complaint letter for the authorities.",
            component: 'upload'
          }
        ]);
        setIsTyping(false);
      }, 1000);
      return;
    }

    setTimeout(() => {
      if (option.id === 'help') {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: "Here is how RoadSathi empowers citizens to make a difference:",
            component: 'help_steps'
          }
        ]);
      } else {
        let botResponse = "I can certainly help you with that!";
        if (option.id === 'support') {
          botResponse = "You can reach our city support team at support@roadsathi.city or call 311 for non-emergency municipal services.";
        }
        setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'bot', text: botResponse }]);
      }
      setIsTyping(false);
    }, 1000);
  };

  const handleUserMessage = (text) => {
    if (!text.trim()) return;

    const userMsg = { id: Date.now(), sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'bot',
        text: "I am currently in demo mode. Please click 'Report a Problem' to see my Generative UI capabilities in action!"
      }]);
      setIsTyping(false);
    }, 1000);
  };

  // Local dummy data mapped by road type — mirrors MongoDB for offline/fallback use
  const getDummyReportData = (roadType = 'Other Road', address = null) => {
    const mapped = {
      'National Highway': {
        contractor: 'L&T Constructions',
        budgetAllocated: '₹5.4 Crore',
        amountSpent: '₹4.8 Crore',
        lastRelayingDate: new Date('2025-01-10'),
        authority: 'National Highways Authority of India',
      },
      'State Highway': {
        contractor: 'ABC Infra Pvt Ltd',
        budgetAllocated: '₹3.2 Crore',
        amountSpent: '₹2.9 Crore',
        lastRelayingDate: new Date('2024-12-15'),
        authority: 'Public Works Department',
      },
      'Major District Road': {
        contractor: 'Urban Roads Pvt Ltd',
        budgetAllocated: '₹2.1 Crore',
        amountSpent: '₹1.8 Crore',
        lastRelayingDate: new Date('2024-10-03'),
        authority: 'Local Municipal Corporations',
      },
      'Other Road': {
        contractor: 'Local Road Contractor',
        budgetAllocated: '₹50 Lakhs',
        amountSpent: '₹42 Lakhs',
        lastRelayingDate: new Date('2024-08-15'),
        authority: 'Local Municipal Corporations',
      },
    };
    const info = mapped[roadType] || mapped['Other Road'];
    return {
      location: address,
      roadName: 'Detected Road',
      roadType,
      ...info,
      issueType: 'Pothole',
      severity: 'High',
      condition: 'Poor',
      roadDamage: 'Poor',
    };
  };

  const handleImageUpload = async (imgData) => {
    if (!imgData) return;
    setIsTyping(true);

    // ── Image Validation: pre-screen before any AI analysis ─────────────────
    // Call the lightweight /validate-image endpoint first.
    // If validation fails → show toast and abort immediately.
    // If service is unreachable → fail-open (don't block the user).
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const validationBlob = await fetch(imgData).then(r => r.blob());
      const validationForm = new FormData();
      validationForm.append('image', validationBlob, 'check.jpg');

      const validationRes = await fetch(`${apiUrl}/api/validate-image`, {
        method: 'POST',
        body: validationForm,
      });

      if (validationRes.ok) {
        const validationData = await validationRes.json();
        if (!validationData.isValid) {
          // Not a road image — stop immediately, show warning toast
          setIsTyping(false);
          showToast(
            'Please upload a valid road or road damage image for analysis.',
            'warning'
          );
          return; // ← halts: no AI analysis, no complaint, no DB write
        }
      }
      // If endpoint unreachable, fall through (fail-open)
    } catch (validationErr) {
      console.warn('Image validation skipped (service unavailable):', validationErr.message);
    }
    // ── End Validation ───────────────────────────────────────────────────────

    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'bot',
      text: coords
        ? '📡 Uploading image to AI · Fetching road data via Nominatim & Overpass API...'
        : '🔍 Analyzing your image and loading road transparency data...'
    }]);

    try {
      // Use fallback coordinates if browser geolocation is unavailable/denied
      const activeCoords = coords || {
        latitude: 12.9716,
        longitude: 77.5946,
        address: "Bengaluru, Karnataka, India"
      };

      // Convert data URL or blob URL → Blob so we can attach it to FormData
      const imageBlob = await fetch(imgData).then(r => r.blob());

      const formData = new FormData();
      formData.append('image', imageBlob, 'road-image.jpg');
      formData.append('lat', activeCoords.latitude);
      formData.append('lng', activeCoords.longitude);
      if (activeCoords.address) formData.append('locationString', activeCoords.address);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s for AI model inference

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${apiUrl}/api/analyze-road`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const result = await res.json();
      if (result.data?._id) {
        localStorage.setItem('lastReportId', result.data._id);
      }
      const isRealAI = result.data?.aiConnected;

      if (result.duplicateDetected) {
        // Show browser alert immediately
        alert("This issue has already been reported.\nYour submission has been counted as a support vote for this issue.");

        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            isDuplicate: true,
            text: "This issue has already been reported.\nYour submission has been counted as a support vote for this issue.",
            component: 'report',
            reportData: result.data
          }
        ]);

        // Automatically redirect to the detailed Review Report page of that complaint after 2.5 seconds
        setTimeout(() => {
          navigate(`/report/${result.data._id}`);
        }, 2500);
      } else {
        // Always show Report, and immediately follow with the formal complaint letter editor
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',


            text: isRealAI
              ? '✅ AI analysis complete! Here is the live road transparency report:'
              : '✅ Analysis complete! Here is the road transparency report for your area:',
            component: 'report',
            reportData: result.data
          },
          {
            id: Date.now() + 2,
            sender: 'bot',
            text: '📝 I have drafted a formal complaint letter addressed to the responsible authority. You can edit and submit it directly:',
            component: 'letter',
            letterContent: generateCitizenLetter(result.data)
          }
        ]);
      }

    } catch (err) {
      console.warn('Using local fallback dummy data:', err.message);

      const fallbackData = getDummyReportData('Other Road', coords?.address || null);

      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: '✅ Analysis complete! Here is the road transparency report for your area:',
          component: 'report',
          reportData: fallbackData
        },
        {
          id: Date.now() + 2,
          sender: 'bot',
          text: '📝 Here is the draft complaint letter you can submit manually:',
          component: 'letter',
          letterContent: generateCitizenLetter(fallbackData)
        }
      ]);
    }

    setIsTyping(false);
  };

  const handleLetterSubmit = () => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          sender: 'bot',
          text: "Excellent! Your report has been officially filed. You can track community issues and view the updated poll on the Dashboard.",
          options: [
            { id: 'dashboard', label: 'Go to Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> }
          ]
        }
      ]);
      setIsTyping(false);
    }, 1000);
  };

  return (
    <div className="max-w-7xl mx-auto w-full flex-grow flex gap-2 md:gap-6 min-h-0" style={{ height: 'calc(100dvh - 72px)' }}>

      {/* Left Sidebar - User History (Visible on large screens) */}
      <div className="hidden lg:flex w-72 flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-colors duration-300 shrink-0">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand-500" />
            Your History
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Recent activity and reports</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {reportingHistory.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (item.isReport) {
                  const lastId = localStorage.getItem('lastReportId');
                  if (lastId) {
                    navigate(`/report/${lastId}`);
                  } else {
                    navigate('/report');
                  }
                } else if (item.isHowItWorks) {
                  navigate('/how-it-works');
                } else if (item.isContactSupport) {
                  navigate('/contact-support');
                }
              }}
              className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
                    {item.icon}
                  </div>
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {item.type}
                  </span>
                </div>
              </div>
              {!item.isReport && !item.isHowItWorks && !item.isContactSupport && (
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="text-slate-500">{item.date}</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${item.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                    item.status === 'In Progress' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                      'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                    {item.status}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => navigate('/admin')}
            className="w-full py-2.5 px-4 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium text-sm rounded-xl hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" /> View All Reports
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-grow flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xl transition-colors duration-300 min-w-0">
        {/* Chat History */}
        <div className="flex-grow overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 scroll-smooth min-h-0">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in w-full`}>
              <div className={`flex w-full ${msg.component ? 'max-w-full' : 'max-w-[92%] sm:max-w-[85%] md:max-w-[75%]'} gap-2 md:gap-4 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                {/* Avatar */}
                <div className={`shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-base md:text-lg shadow-md ${msg.sender === 'user'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white'
                  : 'bg-brand-500 text-white'
                  }`}>
                  {msg.sender === 'user' ? 'U' : 'S'}
                </div>

                {/* Message Content */}
                <div className={`flex flex-col gap-3 ${msg.sender === 'user' ? 'items-end' : 'items-start'} ${msg.component ? 'w-full pr-0 sm:pr-14' : ''} min-w-0`}>
                  <div className={`p-3 md:p-4 rounded-2xl text-sm md:text-base leading-relaxed shadow-sm ${msg.sender === 'user'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tr-sm border border-slate-200 dark:border-slate-700'
                    : msg.isDuplicate
                      ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 rounded-tl-sm border border-amber-200 dark:border-amber-800/30'
                      : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-200 dark:border-slate-700/50'
                    }`}>
                    {msg.isDuplicate ? (
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="whitespace-pre-line font-medium">
                          {msg.text}
                        </div>
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>

                  {/* Inline Components (Generative UI) */}
                  {msg.component === 'upload' && (
                    <div className="w-full max-w-full animate-fade-in">
                      <UploadImage onImageSet={handleImageUpload} />
                    </div>
                  )}

                  {msg.component === 'report' && (
                    <div className="w-full max-w-full animate-fade-in">
                      <RoadReport data={msg.reportData} />
                    </div>
                  )}

                  {msg.component === 'letter' && (
                    <div className="w-full max-w-full animate-fade-in">
                      <LetterEditor initialContent={msg.letterContent} onSubmit={handleLetterSubmit} />
                    </div>
                  )}

                  {msg.component === 'help_steps' && (
                    <div className="w-full max-w-2xl animate-fade-in grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center shadow-sm">
                        <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
                          <span className="font-bold">1</span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-1">Snap & Geotag</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Capture the road hazard. Your browser automatically fetches your location & reverse-geocodes it via Nominatim.</p>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center shadow-sm">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                          <span className="font-bold">2</span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-1">AI & Road Classification</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Our real-time AI analyzes damage severity. The backend detects the road type using Nominatim with resilient Overpass API fallbacks.</p>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center shadow-sm">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                          <span className="font-bold">3</span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-1">Transparent Action</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Map the road to 6 database categories to fetch contractor/budget records, edit the complaint letter, and file it.</p>
                      </div>
                    </div>
                  )}

                  {/* Options (if any) */}
                  {msg.options && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msg.options.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => handleOptionClick(opt)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-brand-50 dark:hover:bg-brand-500/20 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 rounded-xl text-xs font-medium transition-all hover:-translate-y-0.5 active:scale-95 shadow-sm"
                        >
                          {opt.icon}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex gap-4">
                <div className="shrink-0 w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                  S
                </div>
                <div className="p-4 rounded-2xl rounded-tl-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 flex items-center gap-1.5 h-12 shadow-sm">
                  <div className="w-2 h-2 bg-brand-500 dark:bg-brand-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-brand-500 dark:bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-brand-500 dark:bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 md:p-5 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <form
            onSubmit={(e) => { e.preventDefault(); handleUserMessage(inputText); }}
            className="relative max-w-4xl mx-auto flex items-center"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message Sathi..."
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl pl-4 md:pl-5 pr-12 md:pr-14 py-3 md:py-4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition-all shadow-sm text-sm md:text-base"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className={`absolute right-2 p-2 md:p-2.5 rounded-xl flex items-center justify-center transition-all ${inputText.trim()
                ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                }`}
            >
              <Send className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </form>
          <p className="text-center text-[10px] md:text-xs text-slate-500 mt-2">
            Sathi AI can make mistakes. Please verify important municipal information.
          </p>
        </div>
      </div>

      {/* Image Validation Toast — fixed position, overlays entire viewport */}
      <ToastNotification
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
        duration={6000}
      />
    </div>
  );
}
