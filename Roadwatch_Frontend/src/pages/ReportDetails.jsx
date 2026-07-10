import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Calendar, Building2, UserCheck, Activity, FileText, ThumbsUp, AlertTriangle } from 'lucide-react';

export default function ReportDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const targetId = id || localStorage.getItem('lastReportId');

    const fetchUrl = targetId
      ? `${apiUrl}/api/reports/${targetId}?t=${Date.now()}`
      : `${apiUrl}/api/reports?t=${Date.now()}`;

    fetch(fetchUrl)
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          if (Array.isArray(result.data)) {
            setReport(result.data[0] || null);
          } else {
            setReport(result.data);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching report details:', err);
        setLoading(false);
      });
  }, [id]);

  const handleCopy = () => {
    if (report) {
      const letter = generateCitizenLetter(report);
      navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const generateCitizenLetter = (data) => {
    const authority = data?.authority || 'Local Municipal Corporations';
    const rawLocation = data?.location || '';

    let area = 'Local Area';
    let city = 'Bengaluru';
    let state = 'Karnataka';
    let fullAddress = rawLocation || 'Coordinates: Lat/Lng';

    if (rawLocation && rawLocation.includes(',')) {
      const parts = rawLocation.split(',').map(p => p.trim());
      const cleanParts = parts.filter(Boolean);
      if (cleanParts.length >= 3) {
        let stateIndex = cleanParts.length - 1;
        if (cleanParts[stateIndex].toLowerCase() === 'india') {
          stateIndex--;
        }
        if (stateIndex >= 0 && /^\d+$/.test(cleanParts[stateIndex])) {
          stateIndex--;
        }
        if (stateIndex >= 0) {
          state = cleanParts[stateIndex];
          if (stateIndex - 1 >= 0) {
            city = cleanParts[stateIndex - 1];
          }
        }
      }
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

    const date = data?.submittedDate
      ? new Date(data.submittedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 px-4">
        <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No Reports Found</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">There are currently no filed road reports available to view.</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium transition-colors"
        >
          Go Back Home
        </button>
      </div>
    );
  }

  const letterText = generateCitizenLetter(report);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-10 animate-fade-in">
      {/* Back Header */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-slate-500 hover:text-brand-500 font-medium transition-colors mb-6 group"
      >
        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        Back to Home
      </button>

      {/* Main Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <span className="px-3 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider rounded-full border border-amber-200 dark:border-amber-500/20 shrink-0">
              {report.id}
            </span>
            <span className="text-xs text-slate-400">
              Reported on {new Date(report.submittedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {report.updatedAt && ` (Updated: ${new Date(report.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })})`}
            </span>
          </div>
          <h1 className="text-xl md:text-3xl font-bold text-slate-900 dark:text-white mt-2 flex items-start gap-2">
            <MapPin className="w-5 h-5 md:w-6 md:h-6 text-brand-500 shrink-0 mt-1" />
            <span className="break-words min-w-0">{report.location}</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-2xl shadow-sm shrink-0 self-start">
          <ThumbsUp className="w-5 h-5 text-indigo-500 shrink-0" />
          <div>
            <div className="text-xs text-slate-500">Community Support</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">{report.supportCount} Votes</div>
          </div>
        </div>
      </div>

      {/* Responsive Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Column: Complaint Letter */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-500" />
              Citizen Complaint Letter
            </h3>
            <button
              onClick={handleCopy}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${copied
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-brand-500 text-white hover:bg-brand-600'
                }`}
            >
              {copied ? 'Copied!' : 'Copy Letter Text'}
            </button>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-6 shadow-inner font-mono text-xs md:text-sm leading-relaxed overflow-x-auto text-slate-800 dark:text-slate-200 max-h-[500px] md:max-h-[600px] overflow-y-auto whitespace-pre-wrap break-words">
            {letterText}
          </div>
        </div>

        {/* Right Column: Metadata Panels */}
        <div className="lg:col-span-5 space-y-6">

          {/* Card 1: AI Diagnostics */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Activity className="w-5 h-5 text-red-500" />
              AI Diagnostics
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Damage Type</span>
                <span className="font-semibold text-slate-800 dark:text-white capitalize">{report.issueType}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Severity</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 capitalize">
                  {report.severity}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Verification Status</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  {report.status}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Road Condition</span>
                <span className="font-semibold text-slate-800 dark:text-white capitalize">{report.condition}</span>
              </div>

            </div>
          </div>

          {/* Card 2: Road & Contractor Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Building2 className="w-5 h-5 text-indigo-500" />
              Contractor & Budget
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Contractor Name</span>
                <span className="font-semibold text-slate-800 dark:text-white">{report.contractor || 'Unknown'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Budget Allocated</span>
                <span className="font-semibold text-slate-800 dark:text-white">{report.budgetAllocated || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Amount Spent</span>
                <span className="font-semibold text-slate-800 dark:text-white">{report.amountSpent || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Road Type</span>
                <span className="font-semibold text-slate-800 dark:text-white">{report.roadType}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Last Relayed</span>
                <span className="font-semibold text-slate-800 dark:text-white">
                  {report.lastRelayingDate ? new Date(report.lastRelayingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Authority Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <UserCheck className="w-5 h-5 text-emerald-500" />
              Responsible Authority
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Jurisdiction</span>
                <span className="font-semibold text-slate-800 dark:text-white">{report.authority}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Escalation Tier</span>
                <span className="font-semibold text-slate-800 dark:text-white">Municipal Corporation</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
