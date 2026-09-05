import { useEffect, useRef, useState } from 'react';
import { searchLocations } from '../services/locationSearch';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 400;

export default function LocationAutocomplete({
  placeholder = 'Enter location',
  value = '',
  onChange = () => {},
  onSelect = () => {},
  disabled = false,
  label = '',
  showAccuracy = false,
  accuracy = null,
}) {
  const safeValue = typeof value === 'string' ? value : '';
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);
  // Each instance owns its own AbortController so clearing/typing in one
  // field (e.g. Destination) can never cancel another field's (e.g. Source)
  // in-flight request.
  const abortControllerRef = useRef(null);

  const cancelOwnPendingRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // Debounced search
  const performSearch = async (query) => {
    const safeQuery = typeof query === 'string' ? query.trim() : '';

    if (safeQuery.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      setError('');
      return;
    }

    cancelOwnPendingRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError('');
    setSelectedIndex(-1);

    try {
      const results = await searchLocations(safeQuery, 6, controller.signal);
      if (controller.signal.aborted) return;
      setSuggestions(results ?? []);
      setIsOpen((results ?? []).length > 0);
      if (!results || results.length === 0) {
        setError('No locations found');
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Search error:', err);
      setError('Network error. Please try again.');
      setSuggestions([]);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  const handleInputChange = (e) => {
    const newValue = typeof e?.target?.value === 'string' ? e.target.value : '';
    onChange(newValue);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmedValue = newValue.trim();

    if (trimmedValue.length < MIN_QUERY_LENGTH) {
      // Query cleared or too short (e.g. backspaced to empty) - skip the API
      // call entirely and reset suggestion state instead of leaving stale
      // data around.
      cancelOwnPendingRequest();
      setSuggestions([]);
      setIsOpen(false);
      setError('');
      setSelectedIndex(-1);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(newValue);
    }, DEBOUNCE_MS);

    setSelectedIndex(-1);
  };

  const handleSelectSuggestion = (suggestion) => {
    if (!suggestion) return;

    onChange(suggestion.name);
    onSelect({
      name: suggestion.name,
      lat: suggestion.lat,
      lng: suggestion.lng,
      address: suggestion.address,
    });

    setSuggestions([]);
    setIsOpen(false);
    setError('');
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Enter' && (typeof safeValue === 'string' && safeValue.trim().length > 0)) {
        // Allow manual entry
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setSuggestions([]);
        setIsOpen(false);
        setSelectedIndex(-1);
        break;

      default:
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-index]');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target) && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelOwnPendingRequest();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full">
      <div className="space-y-1">
        {label && <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)] ml-1">{label}</label>}

        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={safeValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => (typeof safeValue === 'string' && safeValue.trim().length > 0) && suggestions.length > 0 && setIsOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full rounded-xl border border-[var(--card-border)] bg-[#ffffff05] px-3 py-2 text-white outline-none transition placeholder:text-[#ffffff40] focus:border-[var(--primary)] focus:bg-[rgba(255,45,120,0.05)] disabled:opacity-60 left-panel-input-fix"
          />

          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--card-border)] border-t-[var(--primary)]" />
            </div>
          )}
        </div>

        {showAccuracy && accuracy && (
          <div className="flex items-center gap-2 text-[10px] mt-1 px-1">
            <span className="text-[var(--text-secondary)]">GPS Accuracy: {Math.round(accuracy)} meters</span>
            {accuracy > 50 && <span className="inline-block rounded-full bg-[#F59E0B20] px-1.5 py-0.5 font-semibold text-[var(--medium-yellow)]">Using approximate location</span>}
          </div>
        )}

        {error && !isLoading && (
          <p className="text-[10px] text-[var(--medium-yellow)] mt-1 px-1">{error}</p>
        )}
      </div>

      {isOpen && (suggestions?.length ?? 0) > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] backdrop-blur-xl shadow-glow custom-scrollbar"
        >
          {(suggestions ?? []).map((suggestion, index) => (
            <button
              key={`${suggestion?.lat}-${suggestion?.lng}-${index}`}
              data-index={index}
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full text-left px-3 py-2 border-b border-[#ffffff05] transition ${
                index === selectedIndex
                  ? 'bg-[#FF2D7810] border-[var(--primary)]'
                  : 'hover:bg-[#ffffff05]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{suggestion.name}</p>
                  <p className="truncate text-[10px] text-[var(--text-secondary)] mt-0.5">{suggestion.address}</p>
                </div>
                <span className="mt-0.5 shrink-0 rounded-full border border-[var(--primary)] bg-[#FF2D7810] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">
                  {suggestion.source}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
