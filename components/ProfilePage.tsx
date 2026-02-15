
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import LokiLogo from './LokiLogo';

interface ProfilePageProps {
  user: { id: string; email: string };
  onBack: () => void;
  onLogout: () => void;
}

interface ProfileData {
  displayName: string;
  phone: string;
  bio: string;
  avatarInitial: string;
  financialGoal: string;
  currency: string;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ user, onBack, onLogout }) => {
  const { isDark, toggleTheme } = useTheme();

  const [profile, setProfile] = useState<ProfileData>(() => {
    const saved = localStorage.getItem(`ftm-profile-${user.id}`);
    if (saved) return JSON.parse(saved);
    return {
      displayName: '',
      phone: '',
      bio: '',
      avatarInitial: user.email.charAt(0).toUpperCase(),
      financialGoal: '',
      currency: 'USD'
    };
  });

  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (isSaved) {
      const timer = setTimeout(() => setIsSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isSaved]);

  const handleSave = () => {
    localStorage.setItem(`ftm-profile-${user.id}`, JSON.stringify(profile));
    setIsSaved(true);
    setIsEditing(false);
  };

  const handleChange = (field: keyof ProfileData, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const initial = profile.displayName
    ? profile.displayName.charAt(0).toUpperCase()
    : user.email.charAt(0).toUpperCase();

  return (
    <div className={`min-h-screen p-4 md:p-8 max-w-4xl mx-auto space-y-6 ${isDark ? '' : 'light-mode'}`}>
      {/* Header */}
      <header className="flex items-center justify-between">
        <button
          onClick={onBack}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl transition-all ${
            isDark
              ? 'glass border-slate-700/50 hover:bg-white/10 text-slate-300'
              : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm'
          }`}
        >
          <i className="fa-solid fa-arrow-left text-sm"></i>
          <span className="text-xs font-bold uppercase tracking-widest">Back to Dashboard</span>
        </button>

        <div className="flex items-center gap-3">
          <LokiLogo size={32} />
          <span className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            FINANCIAL TIME MACHINE
          </span>
        </div>
      </header>

      {/* Profile Card */}
      <div className={`rounded-2xl p-8 relative overflow-hidden border ${
        isDark
          ? 'glass border-slate-700/50'
          : 'bg-white border-slate-200 shadow-lg'
      }`}>
        {/* Decorative top bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500"></div>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 flex items-center justify-center shadow-xl shadow-purple-500/20">
              <span className="text-3xl font-bold text-white font-heading">{initial}</span>
            </div>
            <div className={`text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <p className="text-xs font-bold uppercase tracking-widest">Time Traveler</p>
            </div>
          </div>

          {/* Profile details */}
          <div className="flex-1 space-y-5 w-full">
            <div className="flex items-center justify-between">
              <h2 className={`text-2xl font-bold font-heading tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {profile.displayName || user.email.split('@')[0]}
              </h2>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                    isDark
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  <i className="fa-solid fa-pen-to-square"></i> Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    <i className="fa-solid fa-check"></i> Save
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                      isDark
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {isSaved && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                <i className="fa-solid fa-circle-check"></i> Profile saved successfully!
              </div>
            )}

            {/* Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileField
                label="Display Name"
                icon="fa-user"
                value={profile.displayName}
                placeholder="Enter your name"
                editing={isEditing}
                onChange={v => handleChange('displayName', v)}
                isDark={isDark}
              />
              <ProfileField
                label="Email"
                icon="fa-envelope"
                value={user.email}
                placeholder=""
                editing={false}
                onChange={() => {}}
                isDark={isDark}
                disabled
              />
              <ProfileField
                label="Phone"
                icon="fa-phone"
                value={profile.phone}
                placeholder="Enter phone number"
                editing={isEditing}
                onChange={v => handleChange('phone', v)}
                isDark={isDark}
              />
              <ProfileField
                label="Preferred Currency"
                icon="fa-coins"
                value={profile.currency}
                placeholder="USD"
                editing={isEditing}
                onChange={v => handleChange('currency', v)}
                isDark={isDark}
              />
              <div className="md:col-span-2">
                <ProfileField
                  label="Financial Goal"
                  icon="fa-bullseye"
                  value={profile.financialGoal}
                  placeholder="e.g. Save $100k by 2027, retire early, buy a house..."
                  editing={isEditing}
                  onChange={v => handleChange('financialGoal', v)}
                  isDark={isDark}
                />
              </div>
              <div className="md:col-span-2">
                <ProfileField
                  label="Bio"
                  icon="fa-quote-left"
                  value={profile.bio}
                  placeholder="Tell us about yourself..."
                  editing={isEditing}
                  onChange={v => handleChange('bio', v)}
                  isDark={isDark}
                  multiline
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences card */}
      <div className={`rounded-2xl p-6 border ${
        isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'
      }`}>
        <h3 className={`text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2 ${
          isDark ? 'text-slate-400' : 'text-slate-600'
        }`}>
          <i className="fa-solid fa-sliders"></i> Preferences
        </h3>

        <div className="space-y-4">
          {/* Theme toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <i className={`fa-solid ${isDark ? 'fa-moon text-blue-400' : 'fa-sun text-amber-500'}`}></i>
              <div>
                <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </p>
                <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Toggle between dark and light themes
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                isDark ? 'bg-blue-600' : 'bg-amber-400'
              }`}
            >
              <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                isDark ? 'left-0.5' : 'left-7'
              }`}>
                <div className="flex items-center justify-center h-full">
                  <i className={`fa-solid text-[10px] ${isDark ? 'fa-moon text-blue-600' : 'fa-sun text-amber-500'}`}></i>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className={`rounded-2xl p-6 border ${
        isDark ? 'glass border-rose-500/20' : 'bg-white border-rose-200 shadow-lg'
      }`}>
        <h3 className="text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-rose-400">
          <i className="fa-solid fa-triangle-exclamation"></i> Account
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Sign Out</p>
            <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              End your session and return to the login screen
            </p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-widest transition-all"
          >
            <i className="fa-solid fa-right-from-bracket"></i> Logout
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Reusable field component ── */

interface ProfileFieldProps {
  label: string;
  icon: string;
  value: string;
  placeholder: string;
  editing: boolean;
  onChange: (v: string) => void;
  isDark: boolean;
  disabled?: boolean;
  multiline?: boolean;
}

const ProfileField: React.FC<ProfileFieldProps> = ({
  label, icon, value, placeholder, editing, onChange, isDark, disabled, multiline
}) => {
  const inputClass = `w-full rounded-xl px-3 py-2 text-sm transition-all ${
    isDark
      ? 'bg-slate-900/60 border border-slate-700 text-white placeholder-slate-600 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30'
      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30'
  } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} focus:outline-none`;

  return (
    <div>
      <label className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5 ${
        isDark ? 'text-slate-500' : 'text-slate-500'
      }`}>
        <i className={`fa-solid ${icon} text-[8px]`}></i>
        {label}
      </label>
      {editing && !disabled ? (
        multiline ? (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className={inputClass}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
          />
        )
      ) : (
        <p className={`text-sm font-medium py-2 ${
          value
            ? isDark ? 'text-white' : 'text-slate-900'
            : isDark ? 'text-slate-600 italic' : 'text-slate-400 italic'
        }`}>
          {value || placeholder}
        </p>
      )}
    </div>
  );
};

export default ProfilePage;
