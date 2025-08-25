"use client";
import React, { useMemo, useState } from "react";


// ===== Helpers =====
const rndId = () => Math.random().toString(36).slice(2, 9);
const toNum = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
};
const fmt = (v) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(v || 0));
const fmtCurrency = (v, currency) => new Intl.NumberFormat("en-US", { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(v || 0));


// ===== MessageBox Component =====
const MessageBox = ({ title, message, onClose }) => {
  if (!message) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md transform transition-all">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 px-6 py-4 rounded-b-2xl text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};


export default function App() {
  // States
  const [costCols, setCostCols] = useState(() => []);
  const [rows, setRows] = useState(() => [
    {
      id: rndId(),
      name: "",
      productName: "",
      qtyPerWork: "",
      numWork: "",
      price: "",
      targetProfit: "",
      costs: {},
    },
  ]);
  const [editingColId, setEditingColId] = useState(null);
  const [editingColName, setEditingColName] = useState("");
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [customSGInput, setCustomSGInput] = useState("");
  const [customSGValue, setCustomSGValue] = useState(null);
  const [isSuggestingCosts, setIsSuggestingCosts] = useState(false);
  const [messageBox, setMessageBox] = useState({ title: "", message: "" });
  const [targetCurrency, setTargetCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [lastConvertedCurrency, setLastConvertedCurrency] = useState('');


  // Handlers
  const addCostCol = () => {
    const idx = costCols.length + 1;
    const id = rndId();
    setCostCols((c) => [...c, { id, name: `Chi phí ${idx}` }]);
    setRows((rs) => rs.map((r) => ({ ...r, costs: { ...r.costs, [id]: "" } })));
  };


  const removeCostCol = (id) => {
    setCostCols((c) => c.filter((x) => x.id !== id));
    setRows((rs) => rs.map((r) => {
      const nc = { ...r.costs };
      delete nc[id];
      return { ...r, costs: nc };
    }));
  };


  const startRenameCol = (col) => {
    setEditingColId(col.id);
    setEditingColName(col.name);
  };


  const commitRenameCol = () => {
    if (!editingColId) return;
    setCostCols((c) => c.map((x) => (x.id === editingColId ? { ...x, name: editingColName.trim() || x.name } : x)));
    setEditingColId(null);
    setEditingColName("");
  };


  const addRow = () => {
    const id = rndId();
    const costsInit = {};
    costCols.forEach((c) => (costsInit[c.id] = ""));
    setRows((rs) => [
      ...rs,
      { id, name: "", productName: "", qtyPerWork: "", numWork: "", price: "", targetProfit: "", costs: costsInit },
    ]);
  };


  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  const updateCell = (rowId, field, value) => {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
    setExchangeRate(null); // Reset conversion on data change
  };
  const updateCost = (rowId, colId, value) => {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, costs: { ...r.costs, [colId]: value } } : r)));
    setExchangeRate(null); // Reset conversion on data change
  };


  // ===== Gemini API Integrations =====
  const handleSuggestCosts = async () => {
    const productNames = [...new Set(rows.map(r => r.productName).filter(Boolean))];


    if (productNames.length === 0) {
      setMessageBox({ title: "Chưa có sản phẩm", message: "Vui lòng nhập ít nhất một tên sản phẩm để AI có thể gợi ý chi phí." });
      return;
    }


    setIsSuggestingCosts(true);
    const prompt = `Dựa trên các loại sản phẩm sau: ${productNames.join(', ')}, hãy liệt kê các loại chi phí phổ biến có thể phát sinh khi nhập hàng và kinh doanh tại Việt Nam. Ví dụ: chi phí vận chuyển, thuế, marketing, lưu kho, nhân viên, mặt bằng.`;
    
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { 
        contents: chatHistory,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "costs": {
                        "type": "ARRAY",
                        "items": { "type": "STRING" }
                    }
                }
            }
        }
    };
    const apiKey = "AIzaSyC3eYqsnI4Lroh_yKqL9uFZrMqWfxQS8-o" 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;


    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
      const result = await response.json();
      
      if (result.candidates?.[0]?.content?.parts?.[0]) {
        const jsonText = result.candidates[0].content.parts[0].text;
        const parsedJson = JSON.parse(jsonText);
        const suggestedCosts = parsedJson.costs || [];
        const existingCostNames = new Set(costCols.map(c => c.name.toLowerCase()));
        const newCosts = suggestedCosts.filter(cost => !existingCostNames.has(cost.toLowerCase()));


        if (newCosts.length > 0) {
          const newCostCols = newCosts.map(name => ({ id: rndId(), name }));
          setCostCols(prev => [...prev, ...newCostCols]);
          setRows(prevRows => prevRows.map(row => {
            const newCostData = {};
            newCostCols.forEach(col => { newCostData[col.id] = ""; });
            return { ...row, costs: { ...row.costs, ...newCostData } };
          }));
          setMessageBox({ title: "Đã thêm chi phí", message: `AI đã gợi ý và thêm mới ${newCosts.length} mục chi phí: ${newCosts.join(', ')}.` });
        } else {
          setMessageBox({ title: "Không có chi phí mới", message: "Tất cả các chi phí AI gợi ý đã có trong bảng của bạn." });
        }
      } else {
        throw new Error("Invalid response structure from API.");
      }
    } catch (error) {
      console.error("Error suggesting costs:", error);
      setMessageBox({ title: "Lỗi", message: "Không thể nhận gợi ý từ AI. Vui lòng thử lại sau." });
    } finally {
      setIsSuggestingCosts(false);
    }
  };


  const handleCurrencyConversion = async () => {
    if (!targetCurrency) {
      setMessageBox({ title: "Chưa chọn tiền tệ", message: "Vui lòng chọn một loại tiền tệ để quy đổi." });
      return;
    }
    setIsConverting(true);
    setExchangeRate(null);


    const prompt = `Tỷ giá hiện tại cho 1 ${targetCurrency} bằng bao nhiêu VND? Cung cấp câu trả lời dưới dạng đối tượng JSON với một khóa duy nhất là "rate" và giá trị là một con số. Ví dụ: {"rate": 25000}.`;
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = {
      contents: chatHistory,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { "rate": { "type": "NUMBER" } }
        }
      }
    };
    const apiKey = "AIzaSyC3eYqsnI4Lroh_yKqL9uFZrMqWfxQS8-o";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;


    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`API call failed with status: ${response}`);
      const result = await response.json();
      
      if (result.candidates?.[0]?.content?.parts?.[0]) {
        const jsonText = result.candidates[0].content.parts[0].text;
        const parsedJson = JSON.parse(jsonText);
        const rate = parsedJson.rate;
        if (typeof rate === 'number' && rate > 0) {
          setExchangeRate(rate);
          setLastConvertedCurrency(targetCurrency);
          setMessageBox({ title: "Thành công", message: `Đã cập nhật tỷ giá: 1 ${targetCurrency} = ${fmt(rate)} VND.` });
        } else {
          throw new Error("Invalid rate received from API.");
        }
      } else {
        throw new Error("Invalid response structure from API.");
      }
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
      setMessageBox({ title: "Lỗi", message: "Không thể lấy tỷ giá hối đoái. Vui lòng thử lại sau." });
    } finally {
      setIsConverting(false);
    }
  };


  // Calculations
  const calc = useMemo(() => {
    const enriched = rows.map((r) => {
      const Pi = toNum(r.price);
      const M = toNum(r.targetProfit);
      const qtyPerWork = toNum(r.qtyPerWork);
      const numWork = toNum(r.numWork);
      const totalQty = qtyPerWork * numWork;
      let extra = 0;
      costCols.forEach((c) => (extra += toNum(r.costs?.[c.id])));
      const TC = Pi + extra;
      const GB_MT = TC + M;
      return { r, Pi, M, extra, TC, GB_MT, qtyPerWork, numWork, totalQty };
    });


    const gbList = enriched.map((e) => e.GB_MT);
    const hasAny = enriched.length > 0 && gbList.some(v => isFinite(v));
    const max_GB_MT = hasAny ? Math.max(...gbList.filter(v => isFinite(v))) : 0;
    const min_GB_MT = hasAny ? Math.min(...gbList.filter(v => isFinite(v))) : 0;


    let mostIdx = -1;
    let maxVal = -Infinity;
    enriched.forEach((e, i) => {
      if (e.GB_MT > maxVal) {
        maxVal = e.GB_MT;
        mostIdx = i;
      }
    });
    const M_NCC_dat_nhat = mostIdx >= 0 ? enriched[mostIdx].M : 0;


    const SG_antoan = 0;
    const SG_canbang = 0.25 * (max_GB_MT - min_GB_MT);
    const SG_canhtranh = M_NCC_dat_nhat;


    const giaBanTheoSG = (sg) => max_GB_MT - sg;


    let SG_final = null;
    let strategyTitle = null;
    if (selectedStrategy === "antoan") {
      SG_final = SG_antoan;
      strategyTitle = "An toàn";
    } else if (selectedStrategy === "canbang") {
      SG_final = SG_canbang;
      strategyTitle = "Cân bằng";
    } else if (selectedStrategy === "canhtranh") {
      SG_final = SG_canhtranh;
      strategyTitle = "Cạnh tranh";
    } else if (selectedStrategy === "custom") {
      SG_final = toNum(customSGValue);
      strategyTitle = "Tùy chỉnh";
    }


    const GiaBan_ToiUu = SG_final != null ? giaBanTheoSG(SG_final) : null;


    const analysis = enriched.map((e) => {
      const profit = GiaBan_ToiUu != null ? GiaBan_ToiUu - e.TC : null;
      const totalProfit = profit != null ? profit * e.totalQty : null;
      return {
        id: e.r.id,
        name: e.r.name || "(Chưa đặt tên)",
        productName: e.r.productName || "",
        TC: e.TC,
        M: e.M,
        GB_MT: e.GB_MT,
        profit,
        totalQty: e.totalQty,
        totalProfit,
      };
    });


    let ranked = analysis;
    if (GiaBan_ToiUu != null) {
      ranked = [...analysis].sort((a, b) => (toNum(b.profit) - toNum(a.profit)));
    }


    const totalQtyAll = analysis.reduce((a, b) => a + toNum(b.totalQty), 0);
    const totalProfitAll = GiaBan_ToiUu != null ? analysis.reduce((a, b) => a + toNum(b.totalProfit), 0) : null;


    return {
      enriched,
      max_GB_MT,
      min_GB_MT,
      M_NCC_dat_nhat,
      SG_antoan,
      SG_canbang,
      SG_canhtranh,
      GiaBan_ToiUu,
      SG_final,
      strategyTitle,
      ranked,
      totalQtyAll,
      totalProfitAll,
    };
  }, [rows, costCols, selectedStrategy, customSGValue]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <MessageBox 
        title={messageBox.title}
        message={messageBox.message}
        onClose={() => setMessageBox({ title: "", message: "" })}
      />
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Công cụ Định giá Nhập hàng
                </h1>
                <p className="text-xs text-gray-500">Phân tích & Tối ưu hóa chi phí NCC</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                ● Realtime
              </span>
              <span className="text-xs text-gray-500 hidden sm:inline">v2.2</span>
            </div>
          </div>
        </div>
      </header>


      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">Số NCC</div>
            <div className="text-2xl font-bold text-gray-900">{rows.length}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">Tổng SL</div>
            <div className="text-2xl font-bold text-gray-900">{fmt(calc.totalQtyAll)}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">Chiến lược</div>
            <div className="text-2xl font-bold text-gray-900">{calc.strategyTitle || "—"}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">Giá bán đề xuất</div>
            <div className="text-2xl font-bold text-emerald-600">
              {calc.GiaBan_ToiUu ? fmt(calc.GiaBan_ToiUu) : "—"}
            </div>
             {exchangeRate && calc.GiaBan_ToiUu && (
              <div className="text-sm text-gray-500 font-medium mt-1">
                ~ {fmtCurrency(calc.GiaBan_ToiUu / exchangeRate, lastConvertedCurrency)}
              </div>
            )}
          </div>
        </div>


        {/* Section 1: Input Table */}
        <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm">1</span>
                  Nhập liệu Dữ liệu
                </h2>
                <p className="text-xs text-blue-100 mt-1">Nhập thông tin NCC và chi phí</p>
              </div>
              <div className="flex items-center gap-2">
                 <button 
                  onClick={handleSuggestCosts} 
                  disabled={isSuggestingCosts}
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all flex items-center gap-2 backdrop-blur disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSuggestingCosts ? (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : '✨'}
                  {isSuggestingCosts ? 'Đang gợi ý...' : 'Gợi ý Chi phí'}
                </button>
                <button 
                  onClick={addCostCol} 
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all flex items-center gap-2 backdrop-blur"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Thêm chi phí
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">NCC</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Sản phẩm</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">SL/Công</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Số công</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Giá nhập</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Lãi MT</th>
                  {costCols.map((c) => (
                    <th key={c.id} className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">
                      {editingColId === c.id ? (
                        <input 
                          autoFocus 
                          value={editingColName} 
                          onChange={(e) => setEditingColName(e.target.value)} 
                          onBlur={commitRenameCol} 
                          onKeyDown={(e) => e.key === "Enter" && commitRenameCol()} 
                          className="px-2 py-1 rounded border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm normal-case"
                        />
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => startRenameCol(c)} 
                            className="hover:text-blue-600 transition-colors normal-case"
                          >
                            {c.name}
                          </button>
                          <button 
                            onClick={() => removeCostCol(c.id)} 
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>


              <tbody className="divide-y divide-gray-100">
                {rows.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <input 
                        value={r.name} 
                        onChange={(e) => updateCell(r.id, "name", e.target.value)} 
                        placeholder="Tên NCC" 
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-all"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        value={r.productName} 
                        onChange={(e) => updateCell(r.id, "productName", e.target.value)} 
                        placeholder="Tên hàng" 
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-all"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text" 
                        value={r.qtyPerWork} 
                        onChange={(e) => updateCell(r.id, "qtyPerWork", e.target.value)} 
                        placeholder="0" 
                        className="w-full max-w-[120px] px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right transition-all"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text" 
                        value={r.numWork} 
                        onChange={(e) => updateCell(r.id, "numWork", e.target.value)} 
                        placeholder="0" 
                        className="w-full max-w-[120px] px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right transition-all"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text" 
                        value={r.price} 
                        onChange={(e) => updateCell(r.id, "price", e.target.value)} 
                        placeholder="0" 
                        className="w-full max-w-[120px] px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right transition-all"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text" 
                        value={r.targetProfit} 
                        onChange={(e) => updateCell(r.id, "targetProfit", e.target.value)} 
                        placeholder="0" 
                        className="w-full max-w-[120px] px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right transition-all"
                      />
                    </td>
                    {costCols.map((c) => (
                      <td key={c.id} className="px-4 py-3">
                        <input 
                          type="text" 
                          value={r.costs?.[c.id] ?? ""} 
                          onChange={(e) => updateCost(r.id, c.id, e.target.value)} 
                          placeholder="0" 
                          className="w-full max-w-[120px] px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right transition-all"
                        />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => removeRow(r.id)} 
                        className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
                        title="Xóa dòng"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>


          <div className="p-4 bg-gray-50 border-t border-gray-200">
            <button 
              onClick={addRow} 
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Thêm Nhà cung cấp
            </button>
          </div>
        </section>


        {/* Section 2: Strategy Selection */}
        <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm">2</span>
              Chọn Chiến lược Định giá
            </h2>
            <p className="text-xs text-indigo-100 mt-1">Lựa chọn phương án phù hợp với mục tiêu kinh doanh</p>
          </div>


          <div className="p-6">
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {/* Strategy Cards */}
              <div 
                className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${
                  selectedStrategy === "antoan" 
                    ? "border-emerald-500 bg-emerald-50 shadow-lg" 
                    : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                }`}
                onClick={() => {setSelectedStrategy("antoan"); setExchangeRate(null);}}
              >
                {selectedStrategy === "antoan" && (
                  <div className="absolute -top-3 -right-3 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">An toàn</h3>
                    <p className="text-xs text-gray-500">Đảm bảo lãi cho mọi NCC</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mức giảm:</span>
                    <span className="font-mono font-medium">{fmt(calc.SG_antoan)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Giá bán:</span>
                    <span className="font-mono font-medium text-emerald-600">{fmt(calc.max_GB_MT - calc.SG_antoan)}</span>
                  </div>
                </div>
              </div>


              <div 
                className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${
                  selectedStrategy === "canbang" 
                    ? "border-amber-500 bg-amber-50 shadow-lg" 
                    : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                }`}
                onClick={() => {setSelectedStrategy("canbang"); setExchangeRate(null);}}
              >
                {selectedStrategy === "canbang" && (
                  <div className="absolute -top-3 -right-3 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Cân bằng</h3>
                    <p className="text-xs text-gray-500">Tối ưu lợi nhuận & rủi ro</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mức giảm:</span>
                    <span className="font-mono font-medium">{fmt(calc.SG_canbang)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Giá bán:</span>
                    <span className="font-mono font-medium text-amber-600">{fmt(calc.max_GB_MT - calc.SG_canbang)}</span>
                  </div>
                </div>
              </div>


              <div 
                className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${
                  selectedStrategy === "canhtranh" 
                    ? "border-red-500 bg-red-50 shadow-lg" 
                    : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                }`}
                onClick={() => {setSelectedStrategy("canhtranh"); setExchangeRate(null);}}
              >
                {selectedStrategy === "canhtranh" && (
                  <div className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Cạnh tranh</h3>
                    <p className="text-xs text-gray-500">Tối đa hóa sức cạnh tranh</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mức giảm:</span>
                    <span className="font-mono font-medium">{fmt(calc.SG_canhtranh)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Giá bán:</span>
                    <span className="font-mono font-medium text-red-600">{fmt(calc.max_GB_MT - calc.SG_canhtranh)}</span>
                  </div>
                </div>
              </div>
            </div>


            {/* Custom Strategy */}
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hoặc nhập mức giảm giá tùy chỉnh:
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={customSGInput} 
                  onChange={(e) => setCustomSGInput(e.target.value)} 
                  placeholder="Nhập số tiền" 
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button 
                  onClick={() => { 
                    setCustomSGValue(toNum(customSGInput)); 
                    setSelectedStrategy("custom"); 
                    setExchangeRate(null);
                  }} 
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        </section>


        {/* Section 3: Results */}
        {calc.SG_final != null && (
          <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm">3</span>
                Kết quả Phân tích
              </h2>
              <p className="text-xs text-green-100 mt-1">Xếp hạng NCC và phân tích lợi nhuận</p>
            </div>


            <div className="p-6">
              {/* Currency Converter */}
              <div className="p-4 bg-gray-50 rounded-xl mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quy đổi tiền tệ (Tỷ giá được cung cấp bởi AI):
                </label>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={targetCurrency}
                    onChange={(e) => setTargetCurrency(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="USD">USD - Đô la Mỹ</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="JPY">JPY - Yên Nhật</option>
                    <option value="CNY">CNY - Nhân dân tệ</option>
                    <option value="KRW">KRW - Won Hàn Quốc</option>
                    <option value="INR">INR - Rupee Ấn Độ</option>
                  </select>
                  <button
                    onClick={handleCurrencyConversion}
                    disabled={isConverting}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isConverting ? (
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      'Quy đổi'
                    )}
                  </button>
                </div>
              </div>


              {/* Summary Cards */}
              <div className="grid md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4">
                  <div className="text-xs text-blue-600 mb-1">Chiến lược</div>
                  <div className="text-xl font-bold text-blue-900">{calc.strategyTitle}</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4">
                  <div className="text-xs text-purple-600 mb-1">Mức giảm</div>
                  <div className="text-xl font-bold text-purple-900">{fmt(calc.SG_final)}</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4">
                  <div className="text-xs text-emerald-600 mb-1">Giá bán tối ưu</div>
                  <div className="text-xl font-bold text-emerald-900">{fmt(calc.GiaBan_ToiUu)}</div>
                   {exchangeRate && (
                    <div className="text-sm text-emerald-800 font-semibold mt-1">
                      ~ {fmtCurrency(calc.GiaBan_ToiUu / exchangeRate, lastConvertedCurrency)}
                    </div>
                  )}
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4">
                  <div className="text-xs text-amber-600 mb-1">Tổng lợi nhuận</div>
                  <div className={`text-xl font-bold ${toNum(calc.totalProfitAll) < 0 ? "text-red-600" : "text-amber-900"}`}>
                    {calc.totalProfitAll != null ? fmt(calc.totalProfitAll) : "—"}
                  </div>
                  {exchangeRate && calc.totalProfitAll != null && (
                    <div className={`text-sm font-semibold mt-1 ${toNum(calc.totalProfitAll) < 0 ? "text-red-700" : "text-amber-800"}`}>
                      ~ {fmtCurrency(calc.totalProfitAll / exchangeRate, lastConvertedCurrency)}
                    </div>
                  )}
                </div>
              </div>


              {/* Ranking Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Xếp hạng</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">NCC</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Sản phẩm</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">SL Tổng</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Chi phí/SP</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Lợi nhuận/SP</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Tổng lợi nhuận</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {calc.ranked.map((item, idx) => {
                      const isProfitable = toNum(item.profit) >= 0;
                      const meetsTarget = toNum(item.profit) >= toNum(item.M);
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-center">
                            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm
                              ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : 
                                idx === 1 ? 'bg-gray-100 text-gray-700' : 
                                idx === 2 ? 'bg-orange-100 text-orange-700' : 
                                'bg-gray-50 text-gray-600'}`}>
                              {idx + 1}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                          <td className="px-4 py-3 text-gray-600">{item.productName || "—"}</td>
                          <td className="px-4 py-3 text-right font-mono text-sm">{fmt(item.totalQty)}</td>
                          <td className="px-4 py-3 text-right font-mono text-sm">{fmt(item.TC)}</td>
                          <td className={`px-4 py-3 text-right font-mono text-sm font-medium
                            ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                            {fmt(item.profit)}
                          </td>
                          <td className={`px-4 py-3 text-right font-mono text-sm font-bold
                            ${toNum(item.totalProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {fmt(item.totalProfit)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {meetsTarget ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Đạt mục tiêu
                              </span>
                            ) : isProfitable ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Có lãi
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Lỗ
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>


              {/* Footer Stats */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{calc.ranked.filter(r => toNum(r.profit) >= 0).length}/{calc.ranked.length}</div>
                    <div className="text-xs text-gray-500">NCC có lãi</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{fmt(calc.totalQtyAll)}</div>
                    <div className="text-xs text-gray-500">Tổng số lượng</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${toNum(calc.totalProfitAll) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {calc.totalProfitAll != null ? fmt(calc.totalProfitAll) : "—"}
                    </div>
                     {exchangeRate && calc.totalProfitAll != null && (
                      <div className={`text-lg font-semibold mt-1 ${toNum(calc.totalProfitAll) < 0 ? "text-red-700" : "text-green-700"}`}>
                        ~ {fmtCurrency(calc.totalProfitAll / exchangeRate, lastConvertedCurrency)}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">Tổng lợi nhuận</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>


      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-8 text-center">
        <div className="text-sm text-gray-500">
          © 2025 Công cụ Định giá NCC • Phiên bản 2.2 • Powered by Gemini
        </div>
        <div className="text-xs text-gray-400 mt-2">
          Ứng dụng chạy hoàn toàn trên trình duyệt (Client-side) • Không lưu trữ dữ liệu
        </div>
      </footer>
    </div>
  );
}
