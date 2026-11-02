import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  ExternalLink,
  BookOpen,
  TrendingUp,
  Award,
  Layers,
  ChevronRight,
  Search,
  Globe,
  Lightbulb,
  X,
  Compass,
  GraduationCap
} from 'lucide-react';
import { apiFetch } from '../authClient';

export interface InsightItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  takeaway: string;
  source: string;
  date: string;
}

export interface InsightSource {
  title: string;
  url: string;
}

interface SemesterInsightSidebarProps {
  department: string;
  isOpen: boolean;
  onClose?: () => void;
  isFloatingDrawer?: boolean;
}

export const SemesterInsightSidebar: React.FC<SemesterInsightSidebarProps> = ({
  department,
  isOpen,
  onClose,
  isFloatingDrawer = false
}) => {
  const [items, setItems] = useState<InsightItem[]>([]);
  const [sources, setSources] = useState<InsightSource[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTopic, setSearchTopic] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isLiveGrounded, setIsLiveGrounded] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeDepartment, setActiveDepartment] = useState<string>(department || 'Engineering & Sciences');

  const categories = [
    'All',
    'Pedagogy & Curriculum',
    'Industry Trends',
    'Research & AI',
    'Accreditation & Policy'
  ];

  const fetchInsights = async (deptToQuery?: string) => {
    setLoading(true);
    const targetDept = deptToQuery || activeDepartment || department || 'Engineering & Sciences';
    try {
      const res = await apiFetch(`/api/insights/academic-news?department=${encodeURIComponent(targetDept)}`);
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
        setSources(data.sources || []);
        setQueries(data.queries || []);
        setIsLiveGrounded(!!data.isLiveGrounded);
        setLastUpdated(data.lastUpdated || '');
        if (data.department) setActiveDepartment(data.department);
      }
    } catch (err) {
      console.error('Failed to fetch semester academic insights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (department && department !== activeDepartment) {
      setActiveDepartment(department);
      fetchInsights(department);
    } else {
      fetchInsights();
    }
  }, [department]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTopic.trim()) {
      setActiveDepartment(searchTopic.trim());
      fetchInsights(searchTopic.trim());
    }
  };

  const filteredItems = selectedCategory === 'All'
    ? items
    : items.filter(it => it.category.toLowerCase().includes(selectedCategory.toLowerCase().slice(0, 8)));

  if (!isOpen) return null;

  return (
    <div
      className={`flex flex-col bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl shadow-sm overflow-hidden text-[#1E1E16] transition-all duration-300 font-body ${
        isFloatingDrawer
          ? 'fixed inset-y-4 right-4 w-96 max-w-[calc(100vw-2rem)] z-50 shadow-2xl'
          : 'w-full h-full'
      }`}
    >
      {/* 1. Header — Deep Espresso (#1E1E16) with Warm Ivory (#F1F0EB) typography */}
      <div className="bg-[#1E1E16] text-[#F1F0EB] p-4.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center font-bold shadow-xs">
              <Sparkles className="w-4 h-4 text-[#F1F0EB]" />
            </div>
            <div>
              <h2 className="text-base font-heading font-medium tracking-tight text-[#F1F0EB]">
                Semester Insights
              </h2>
              <p className="text-[11px] font-body text-[#9B8A79] font-normal">
                Academic Trends & Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchInsights(activeDepartment)}
              disabled={loading}
              title="Refresh with Google Search"
              className="p-1.5 rounded-lg bg-[#E4E0D5]/10 text-[#F1F0EB] hover:bg-[#A7674D] transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-[#E4E0D5]/10 text-[#F1F0EB] hover:bg-[#A7674D] transition-colors cursor-pointer"
                title="Close Sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Active Department Badge & Grounding Status */}
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-[#9B8A79]/30 text-[11px]">
          <span className="px-2.5 py-0.5 rounded-md bg-[#6C6B50] text-[#F1F0EB] font-medium truncate max-w-[200px]">
            {activeDepartment}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E4E0D5]/15 text-[#F1F0EB] text-[10px]">
            <Globe className="w-3 h-3 text-[#A7674D]" />
            <span>Search Grounded</span>
          </span>
          {lastUpdated && (
            <span className="text-[10px] text-[#9B8A79] ml-auto font-mono-numbers">
              {lastUpdated}
            </span>
          )}
        </div>
      </div>

      {/* 2. Department Topic Search Bar */}
      <div className="p-3 bg-[#F1F0EB] border-b border-[#9B8A79]/30">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <input
            type="text"
            value={searchTopic}
            onChange={(e) => setSearchTopic(e.target.value)}
            placeholder={`Search department e.g. ${department || 'Computer Science'}...`}
            className="w-full text-xs px-3 py-2 pl-8 rounded-xl bg-[#E4E0D5] border border-[#9B8A79]/40 text-[#1E1E16] placeholder-[#9B8A79] focus:outline-none focus:ring-1 focus:ring-[#A7674D]"
          />
          <Search className="w-3.5 h-3.5 text-[#9B8A79] absolute left-2.5 pointer-events-none" />
          {searchTopic && (
            <button
              type="submit"
              className="absolute right-1 px-2.5 py-1 rounded-lg bg-[#A7674D] text-[#F1F0EB] text-[10px] font-medium hover:bg-[#6C6B50] transition-colors"
            >
              Search
            </button>
          )}
        </form>

        {/* Quick Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2.5 pb-0.5 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#A7674D] text-[#F1F0EB] shadow-xs'
                  : 'bg-[#E4E0D5] text-[#1E1E16] hover:bg-[#6C6B50] hover:text-[#F1F0EB]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 3. News & Trend Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#F1F0EB]">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2.5 text-[#9B8A79]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#A7674D]" />
            <p className="text-xs font-medium text-[#1E1E16]">
              Fetching latest academic news & trends...
            </p>
            <p className="text-[11px] text-[#9B8A79] max-w-[220px]">
              Querying live Google Search grounding for {activeDepartment}
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#9B8A79] border border-dashed border-[#9B8A79]/40 rounded-xl bg-[#E4E0D5]/40 p-4">
            <Compass className="w-7 h-7 text-[#9B8A79] mx-auto mb-2" />
            <p className="font-medium text-[#1E1E16]">No specific items in this category</p>
            <p className="text-[11px] text-[#9B8A79] mt-1">Select "All" or search another discipline.</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <article
              key={item.id}
              className="bg-[#E4E0D5] border border-[#9B8A79]/30 rounded-xl p-3.5 shadow-xs hover:border-[#A7674D] transition-all space-y-2"
            >
              {/* Category & Date */}
              <div className="flex items-center justify-between text-[10px] text-[#9B8A79]">
                <span className="px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-[#6C6B50] text-[#F1F0EB]">
                  {item.category}
                </span>
                <span className="font-mono-numbers text-[#9B8A79]">
                  {item.date || 'Semester 2026'}
                </span>
              </div>

              {/* Title in Playfair Display */}
              <h3 className="text-sm font-heading font-medium text-[#1E1E16] leading-snug">
                {item.title}
              </h3>

              {/* Summary */}
              <p className="text-[11px] text-[#1E1E16]/85 leading-relaxed font-body">
                {item.summary}
              </p>

              {/* Actionable Faculty Takeaway */}
              {item.takeaway && (
                <div className="bg-[#F1F0EB] border border-[#9B8A79]/30 rounded-lg p-2.5 flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center shrink-0 mt-0.5">
                    <Lightbulb className="w-3 h-3 text-[#F1F0EB]" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#A7674D]">
                      Faculty Action Takeaway
                    </span>
                    <p className="text-[11px] text-[#1E1E16] font-medium leading-tight mt-0.5">
                      {item.takeaway}
                    </p>
                  </div>
                </div>
              )}

              {/* Source attribution */}
              <div className="flex items-center justify-between pt-1 border-t border-[#9B8A79]/20 text-[10px] text-[#9B8A79]">
                <span className="flex items-center gap-1 font-medium truncate max-w-[200px]">
                  <GraduationCap className="w-3 h-3 text-[#6C6B50]" />
                  {item.source}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-[#9B8A79] font-medium">
                  Verified Feed
                </span>
              </div>
            </article>
          ))
        )}
      </div>

      {/* 4. Footer — Verified Academic Sources & Search Citations */}
      {sources.length > 0 && (
        <div className="p-3 bg-[#E4E0D5] border-t border-[#9B8A79]/30 text-xs font-body">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#1E1E16] mb-1.5">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#A7674D]" />
              Search Grounded Sources
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#A7674D] text-[#F1F0EB] font-mono-numbers font-medium">
              {sources.length} sources
            </span>
          </div>
          <div className="space-y-1">
            {sources.slice(0, 3).map((s, idx) => (
              <a
                key={idx}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#F1F0EB] border border-[#9B8A79]/30 text-[10px] font-medium text-[#1E1E16] hover:bg-[#A7674D] hover:text-[#F1F0EB] transition-colors"
              >
                <span className="truncate pr-2">{s.title || 'Academic Reference'}</span>
                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
