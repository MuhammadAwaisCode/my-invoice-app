"use client";
import Navbar from "@/components/Navbar";
import InvoiceBuilder from "@/components/InvoiceBuilder";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />
      <main className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
       
        <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 border-gray-200 dark:border-gray-800 gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              Criticpick Solutions — Enterprise Billing Portal
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              FBR IMS/POS Compliant Live Invoicing Engine
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/50">
              FBR Production Ready
            </span>
          </div>
        </header>
        
    
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <InvoiceBuilder />
        </div>

      </div>
      </main>
    </div>
  );
}