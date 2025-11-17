// app/page.js

"use client";

import { useState, useRef } from "react";
import QRCodeComponent from "react-qr-code";
import Papa from "papaparse";
import JSZip from "jszip";
import QRCodeSVG from "qrcode-svg";
import { Canvg } from "canvg";

// Pastikan Anda memuat library Canvg, PapaParse, JSZip, dan QRCodeSVG di lingkungan Anda.

const DEFAULT_QR_SIZE = 250;

// --- UTILITY: Fungsi untuk download gambar (PNG/JPG) ---
// Memerlukan SVG string dan ukuran
const downloadAsImage = async (
  svgString,
  filename,
  size,
  format = "jpeg",
  quality = 0.9
) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  try {
    const v = await Canvg.from(ctx, svgString);
    await v.render();

    const dataUrl = canvas.toDataURL(`image/${format}`, quality);

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${filename}.${format === "jpeg" ? "jpg" : format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Gagal mengkonversi SVG ke Canvas/Image:", error);
    // Mengganti alert() dengan console.error
    console.error("Gagal mengkonversi gambar. Periksa konsol untuk detail.");
  }
};

// Komponen Select untuk Ukuran
const SizeSelector = ({ qrSize, setQrSize }) => (
  <div className="mb-4">
    <label
      htmlFor="qr-size"
      className="block text-sm font-medium text-gray-700 mb-1"
    >
      Pilih Ukuran QR Code (Resolusi Piksel)
    </label>
    <select
      id="qr-size"
      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-black"
      value={qrSize}
      onChange={(e) => setQrSize(parseInt(e.target.value, 10))}
    >
      <option value={250}>Sedang (250px) - Default</option>
      <option value={350}>Besar (350px)</option>
      <option value={450}>Sangat Besar (450px)</option>
    </select>
  </div>
);

export default function Home() {
  const [qrSize, setQrSize] = useState(DEFAULT_QR_SIZE);
  const [loading, setLoading] = useState(false);

  // State untuk Generator Tunggal
  const [singleText, setSingleText] = useState("");
  const [singleQrValue, setSingleQrValue] = useState("");
  const singleQrRef = useRef(null);

  // State untuk Generator Massal
  const [bulkData, setBulkData] = useState([]);
  const [fileError, setFileError] = useState("");
  const [isFileLoaded, setIsFileLoaded] = useState(false);
  // State baru untuk menyimpan nama file yang dipilih
  const [selectedFileName, setSelectedFileName] = useState(null);
  const fileInputRef = useRef(null);

  // --- LOGIC UNTUK GENERATOR TUNGGAL ---
  const handleGenerateSingle = () => {
    // Kosongkan status massal saat beralih ke tunggal
    setBulkData([]);
    setIsFileLoaded(false);
    setFileError("");
    setSelectedFileName(null); // Reset nama file
    setSingleQrValue(singleText);
  };

  // --- UTILITY UNTUK DOWNLOAD TUNGGAL ---
  const handleDownloadSingle = async () => {
    if (!singleQrRef.current || !singleQrValue) return;

    const svg = singleQrRef.current.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);

    // Penamaan file
    const filename =
      singleQrValue.length > 50
        ? singleQrValue
            .substring(0, 50)
            .replace(/[^a-z0-9]/gi, "_")
            .toLowerCase()
        : singleQrValue.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    // Panggil fungsi utility downloadAsImage
    await downloadAsImage(
      svgData,
      filename || "qrcode_tunggal",
      qrSize,
      "jpeg",
      0.9
    );
  };

  // --- LOGIC UNTUK UPLOAD CSV (HANYA MEMBACA DAN MENYIMPAN DATA) ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) {
      setSelectedFileName(null); // Reset nama file jika input dibatalkan
      return;
    }

    setFileError("");
    setSingleQrValue("");
    setIsFileLoaded(false); // Reset status

    // Simpan nama file yang dipilih
    setSelectedFileName(file.name);

    // event.target.value = null; // Dihapus dari sini

    if (file.type && file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      setFileError("File harus berformat CSV.");
      setBulkData([]);
      setSelectedFileName(null);
      // Atur ulang input file agar bisa memilih file yang sama lagi
      if (fileInputRef.current) fileInputRef.current.value = null;
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data.filter((item) => {
          return (
            (item.Link && item.Link.trim() !== "") ||
            (item.Teks && item.Teks.trim() !== "")
          );
        });

        if (data.length === 0) {
          setFileError(
            'Tidak ditemukan data valid. Pastikan ada kolom "Link" atau "Teks" di file CSV Anda.'
          );
          setBulkData([]);
          setIsFileLoaded(false);
          setSelectedFileName(null);
          if (fileInputRef.current) fileInputRef.current.value = null;
        } else {
          setBulkData(data);
          setIsFileLoaded(true); // Tandai file sudah berhasil dimuat
          setFileError(
            `Berhasil memuat ${data.length} link/teks. Tekan tombol di bawah untuk mulai membuat QR Code.`
          );
          // Nama file sudah diset
        }
      },
      error: (error) => {
        setFileError(`Gagal memparsing file: ${error.message}`);
        setBulkData([]);
        setIsFileLoaded(false);
        setSelectedFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = null;
      },
    });
  };

  // --- LOGIC UTAMA UNTUK GENERATE DAN DOWNLOAD MASSAL ---
  const handleGenerateBulk = async () => {
    if (bulkData.length === 0 || loading) return;

    setLoading(true);
    setFileError(`Memproses ${bulkData.length} QR Code... Harap tunggu.`);

    const zip = new JSZip();
    const folder = zip.folder("qr_codes_massal_jpg"); // Nama folder di ZIP

    const canvas = document.createElement("canvas");
    canvas.width = qrSize;
    canvas.height = qrSize;
    const ctx = canvas.getContext("2d");

    try {
      for (let i = 0; i < bulkData.length; i++) {
        const item = bulkData[i];
        const value = item.Link || item.Teks;

        const qrcodeSvg = new QRCodeSVG({
          content: value,
          padding: 10,
          width: qrSize,
          height: qrSize,
          color: "#000000",
          background: "#ffffff",
          ecl: "L",
        });
        const svgString = qrcodeSvg.svg();

        // Konversi SVG ke Canvas/JPEG
        const v = await Canvg.from(ctx, svgString);
        await v.render();

        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        const base64Data = dataUrl.split(",")[1];

        // Sanitasi Nama File
        let filename =
          value.length > 50
            ? value
                .substring(0, 50)
                .replace(/[^a-z0-9]/gi, "_")
                .toLowerCase()
            : value.replace(/[^a-z0-9]/gi, "_").toLowerCase();

        folder.file(`qr_${i + 1}_${filename || "unknown"}.jpg`, base64Data, {
          base64: true,
        });

        setFileError(
          `Memproses... ${i + 1} dari ${bulkData.length} kode selesai.`
        );
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `qr_codes_massal_jpg_${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFileError(
        `Sukses! ${bulkData.length} QR Code telah diunduh dalam file ZIP (JPG).`
      );
    } catch (e) {
      setFileError(
        `Gagal membuat file ZIP. Pastikan semua library terinstal. Error: ${e.message}`
      );
      console.error("Bulk Download Error:", e);
    } finally {
      setLoading(false);
      setIsFileLoaded(false); // Reset status setelah selesai
      setSelectedFileName(null); // Reset nama file setelah download
      if (fileInputRef.current) fileInputRef.current.value = null; // Kosongkan input file asli
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 p-8">
      <div className="w-full max-w-4xl rounded-xl bg-white p-8 shadow-2xl mt-10">
        <h1 className="mb-6 text-center text-3xl font-bold text-gray-800">
          Super QR Code Generator
        </h1>

        {/* Kontainer utama menggunakan Flexbox dengan items-start untuk mencegah pergeseran vertikal */}
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* --- SECTION 1: GENERATOR TUNGGAL --- */}
          <div className="md:w-1/2 p-6 border border-gray-200 rounded-lg shadow-md flex-shrink-0 w-full">
            <h2 className="text-xl font-semibold mb-4 text-blue-600">
              1. Generator Tunggal
            </h2>

            <textarea
              rows="4"
              className="w-full rounded-md border border-gray-300 p-3 text-sm focus:border-blue-500 focus:ring-blue-500 mb-4 text-black"
              placeholder="Masukkan satu link atau teks..."
              value={singleText}
              onChange={(e) => setSingleText(e.target.value)}
            />

            <SizeSelector qrSize={qrSize} setQrSize={setQrSize} />

            <button
              className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-50"
              onClick={handleGenerateSingle}
              disabled={!singleText.trim()}
            >
              Generate Kode Tunggal
            </button>

            {/* Pratinjau tunggal. */}
            {singleQrValue && (
              <div className="mt-6 flex flex-col items-center gap-4 p-4 border rounded-lg bg-gray-50">
                <h3 className="text-md font-semibold text-gray-800">
                  Hasil Pratinjau
                </h3>
                <div ref={singleQrRef} className="p-2 border rounded-md">
                  <QRCodeComponent
                    value={singleQrValue}
                    size={qrSize}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                  />
                </div>
                <button
                  onClick={handleDownloadSingle}
                  className="mt-2 text-sm bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-md transition-colors w-full max-w-[200px]"
                >
                  Download JPG Tunggal
                </button>
              </div>
            )}
          </div>

          {/* --- SECTION 2: GENERATOR MASSAL (CSV) --- */}
          <div className="md:w-1/2 p-6 border border-gray-200 rounded-lg shadow-md bg-yellow-50 flex-grow w-full">
            <h2 className="text-xl font-semibold mb-4 text-yellow-800">
              2. Generator Massal (CSV)
            </h2>
            <p className="text-sm mb-4 text-gray-600">
              Unggah file CSV (Kolom pertama beri judul Link lalu kolom
              selanjutnya isi url/kode).
            </p>

            <SizeSelector qrSize={qrSize} setQrSize={setQrSize} />

            {/* INPUT FILE KUSTOM - MENAMPILKAN NAMA FILE YANG DIPILIH */}
            <div className="flex items-center space-x-2">
              <label className="flex-grow">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden" // Sembunyikan input asli
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                />
                {/* Ini adalah tombol/tampilan kustom */}
                <div
                  className={`w-full text-sm text-gray-700 py-2 px-4 rounded-lg cursor-pointer transition-colors border ${
                    selectedFileName
                      ? "border-yellow-600 bg-yellow-100 hover:bg-yellow-200"
                      : "border-gray-300 bg-white hover:bg-gray-100"
                  }`}
                >
                  {
                    selectedFileName
                      ? `File Terpilih: ${selectedFileName}`
                      : "Pilih File CSV..." // Teks default
                  }
                </div>
              </label>
              {/* Tombol Hapus (X) opsional untuk mereset pilihan */}
              {selectedFileName && (
                <button
                  onClick={() => {
                    setSelectedFileName(null);
                    setBulkData([]);
                    setIsFileLoaded(false);
                    setFileError("");
                    if (fileInputRef.current) fileInputRef.current.value = null;
                  }}
                  className="p-2 text-red-500 hover:text-red-700 transition-colors rounded-full"
                  aria-label="Hapus file yang dipilih"
                >
                  {/* Ikon silang (X) */}
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </button>
              )}
            </div>

            {/* Area Pesan */}
            {fileError && (
              <p
                className={`mt-3 text-sm font-medium ${
                  isFileLoaded ? "text-green-600" : "text-red-600"
                }`}
              >
                {fileError}
              </p>
            )}

            {/* Tombol GENERATE DAN DOWNLOAD, hanya muncul jika file sudah dimuat */}
            {isFileLoaded && (
              <div className="mt-6">
                <button
                  className={`w-full rounded-md px-6 py-3 text-lg font-semibold text-white transition-all shadow-lg ${
                    loading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
                  }`}
                  onClick={handleGenerateBulk} // Memanggil fungsi generate
                  disabled={loading}
                >
                  {loading ? "Membuat ZIP..." : `Download (${bulkData.length})`}
                </button>
                {loading && (
                  <p className="mt-2 text-center text-sm text-blue-600">
                    Jangan tutup browser Anda. Proses mungkin memakan waktu
                    beberapa saat.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
