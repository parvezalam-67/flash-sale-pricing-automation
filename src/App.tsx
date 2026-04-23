/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { BannerCanvas } from './components/BannerCanvas';
import { ControlPanel } from './components/ControlPanel';
import { generateBannerBackground } from './services/ai';
import { fetchAllSales, SalePricing, AllSalesData } from './services/sheetService';
import { PLANS as STATIC_PLANS, THEMES } from './constants';

type TabType = string;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('forex');
  const [flashText, setFlashText] = useState('FLASH SALE');
  const [discountPercent, setDiscountPercent] = useState('66');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [bgPrompt, setBgPrompt] = useState('Abstract forex trading chart with glowing neon green lines on deep black background, cinematic lighting');
  
  // Dynamic Sheet Data State
  const [salesData, setSalesData] = useState<AllSalesData | null>(null);
  const [currentSale, setCurrentSale] = useState('');
  const [plans, setPlans] = useState(STATIC_PLANS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async (isInitial = false) => {
    try {
      if (!isInitial) setIsSyncing(true);
      const data = await fetchAllSales();
      
      setSalesData(prev => {
        // Simple comparison to check if we should update
        if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
        
        // If data changed or it's initial load, update states
        if (isInitial) {
          const keys = Object.keys(data);
          // Default logic for initial load: signals > forex > first available
          const initialTab = keys.includes('signals') ? 'signals' : (keys.includes('forex') ? 'forex' : keys[0]);
          
          if (initialTab && !activeTab) {
            setActiveTab(initialTab);
          }

          if (initialTab) {
            const currentList = data[initialTab] || [];
            if (currentList.length > 0) {
              const latestSale = currentList[currentList.length - 1];
              setCurrentSale(latestSale.saleName);
              setPlans(latestSale.plans);
              setFlashText(latestSale.displayName.toUpperCase());
              if (latestSale.discountPercent) setDiscountPercent(latestSale.discountPercent);
            }
          }
        }
        return data;
      });
    } catch (err) {
      console.error('Data sync failed', err);
    } finally {
      if (!isInitial) {
        setTimeout(() => setIsSyncing(false), 2000); // Keep indicator for 2s
      } else {
        setIsLoading(false);
      }
    }
  }, []); // Removed currentSale dependency to prevent reset loop

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Socket.io Real-time Setup
  useEffect(() => {
    const socket = io();

    socket.on('connect', () => {
      console.log('Real-time connection established');
    });

    socket.on('sheet-updated', () => {
      console.log('Live update received from Google Sheet!');
      loadData();
    });

    return () => {
      socket.disconnect();
    };
  }, [loadData]);

  // Update when tab changes
  useEffect(() => {
    if (salesData && activeTab) {
      const currentList = salesData[activeTab] || [];
      if (currentList.length > 0) {
        // Look for the current sale name in the new list, or default to the LAST (latest) in the list
        const sale = currentList.find(s => s.saleName === currentSale) || currentList[currentList.length - 1];
        setCurrentSale(sale.saleName);
        setPlans(sale.plans);
        setFlashText(sale.displayName.toUpperCase());
        if (sale.discountPercent) {
          setDiscountPercent(sale.discountPercent);
        }
      }
    }
  }, [activeTab, salesData]);

  const handleSaleChange = (saleName: string) => {
    if (!salesData || !activeTab) return;
    const currentList = salesData[activeTab] || [];
    const sale = currentList.find(s => s.saleName === saleName);
    if (sale) {
      setCurrentSale(saleName);
      setPlans(sale.plans);
      setFlashText(sale.displayName.toUpperCase());
      if (sale.discountPercent) {
        setDiscountPercent(sale.discountPercent);
      }
    }
  };

  const handleGenerateBackground = async () => {
    setIsGenerating(true);
    const result = await generateBannerBackground(bgPrompt);
    if (result) setBgImage(result);
    setIsGenerating(false);
  };

  /* Global Pattern Styles */
  const bannerRef = useRef<HTMLDivElement>(null);
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setCustomBgImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownload = async () => {
    if (!bannerRef.current) return;
    try {
      const { toPng } = await import('html-to-image');
      
      // Calculate 2K dimensions (2560x1440)
      const targetWidth = 2560;
      const targetHeight = 1440;
      
      const dataUrl = await toPng(bannerRef.current, { 
        cacheBust: true,
        pixelRatio: 2, // Double resolution for extra sharpness
        canvasWidth: targetWidth,
        canvasHeight: targetHeight,
        style: {
          width: `${targetWidth}px`,
          height: `${targetHeight}px`,
          transform: 'none',
          borderRadius: '0'
        }
      });
      
      const link = document.createElement('a');
      link.download = `${activeTab}-subscription-banner.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  const currentAvailableSales = (salesData && activeTab && salesData[activeTab]) ? salesData[activeTab] : [];

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-[#030e06] flex flex-col items-center justify-center space-y-6">
        <div className="w-16 h-16 border-4 border-[#00e676]/20 border-t-[#00e676] rounded-full animate-spin shadow-[0_0_20px_rgba(0,230,118,0.2)]" />
        <div className="flex flex-col items-center">
          <h2 className="text-[#00e676] font-black uppercase tracking-[0.3em] text-xl animate-pulse">SURESHOT FX</h2>
          <p className="text-gray-500 text-[10px] uppercase font-black tracking-widest mt-2">Connecting to Data Intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black font-sans text-white overflow-hidden selection:bg-[#00e676] selection:text-black">
      {/* Tab Switcher */}
      <div className="flex justify-center py-4 bg-[#030e06] border-b border-white/5 space-x-2 overflow-x-auto px-4">
        {salesData && Object.keys(salesData).length > 0 && Object.keys(salesData).map(key => {
          const theme = THEMES[key] || THEMES['forex'];
          const isActive = activeTab === key;
          return (
            <button 
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-8 py-2 rounded-full font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${isActive ? 'text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
              style={isActive ? { 
                backgroundColor: theme.accent,
                boxShadow: `0 0 20px ${theme.accent}4D`
              } : {}}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          );
        })}
      </div>

      {/* The 16:9 Banner Canvas */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
        <BannerCanvas 
          ref={bannerRef}
          mode={activeTab as any}
          flashText={flashText}
          discountPercent={discountPercent}
          bgImage={customBgImage || bgImage}
          plans={plans}
          sectionTitle={
            activeTab ? `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Subscription Plan` : ""
          }
        />
      </div>

      {/* The Editor Control Panel */}
      <ControlPanel 
        props={{ 
          flashText, 
          discountPercent, 
          bgPrompt, 
          isGenerating,
          isSyncing,
          availableSales: currentAvailableSales,
          currentSale
        }}
        actions={{
          setFlashText,
          setDiscountPercent,
          setBgPrompt,
          generateBackground: handleGenerateBackground,
          setCurrentSale: handleSaleChange,
          handleDownload: handleDownload,
          handleImageUpload: handleImageUpload,
          handleRefresh: () => window.location.reload()
        }}
      />

      {/* Global Pattern Styles */}
      <style>{`
        .bg-grid {
          background-size: 5vw 5vw;
          background-image:
            linear-gradient(to right, rgba(0, 230, 118, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 230, 118, 0.08) 1px, transparent 1px);
        }
      `}</style>
    </div>
  );
}
