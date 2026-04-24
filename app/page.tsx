'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';

// تحميل Leaflet بدون SSR
const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
});

interface ImageData {
  id: number;
  src: string;
  latitude: number | null;
  longitude: number | null;
  filename: string;
  uploadDate: string;
}

export default function Home() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('gpsImages');
    if (stored) {
      setImages(JSON.parse(stored));
    }
  }, []);

  const showStatus = (message: string) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const convertDMSToDD = (dms: number[], ref: string): number => {
    const degrees = dms[0];
    const minutes = dms[1];
    const seconds = dms[2];
    let dd = degrees + minutes / 60 + seconds / 3600;
    if (ref === 'S' || ref === 'W') {
      dd = dd * -1;
    }
    return dd;
  };

  const processImage = (file: File): Promise<void> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          try {
            // @ts-ignore
            if (typeof window !== 'undefined' && window.EXIF) {
              // @ts-ignore
              window.EXIF.getData(img, function () {
                try {
                  // @ts-ignore
                  const lat = window.EXIF.getTag(this, 'GPSLatitude');
                  // @ts-ignore
                  const lon = window.EXIF.getTag(this, 'GPSLongitude');
                  // @ts-ignore
                  const latRef = window.EXIF.getTag(this, 'GPSLatitudeRef');
                  // @ts-ignore
                  const lonRef = window.EXIF.getTag(this, 'GPSLongitudeRef');

                  let latitude = null;
                  let longitude = null;

                  if (lat && lon) {
                    latitude = convertDMSToDD(lat, latRef);
                    longitude = convertDMSToDD(lon, lonRef);
                  }

                  const imageData: ImageData = {
                    id: Date.now() + Math.random(),
                    src: e.target?.result as string,
                    latitude,
                    longitude,
                    filename: file.name,
                    uploadDate: new Date().toISOString(),
                  };

                  setImages((prev) => {
                    const updated = [...prev, imageData];
                    localStorage.setItem('gpsImages', JSON.stringify(updated));
                    return updated;
                  });
                  resolve();
                } catch (error) {
                  console.error('خطأ في معالجة EXIF:', error);
                  // حفظ الصورة بدون GPS
                  const imageData: ImageData = {
                    id: Date.now() + Math.random(),
                    src: e.target?.result as string,
                    latitude: null,
                    longitude: null,
                    filename: file.name,
                    uploadDate: new Date().toISOString(),
                  };
                  setImages((prev) => {
                    const updated = [...prev, imageData];
                    localStorage.setItem('gpsImages', JSON.stringify(updated));
                    return updated;
                  });
                  resolve();
                }
              });
            } else {
              // EXIF غير متوفر - حفظ بدون GPS
              const imageData: ImageData = {
                id: Date.now() + Math.random(),
                src: e.target?.result as string,
                latitude: null,
                longitude: null,
                filename: file.name,
                uploadDate: new Date().toISOString(),
              };
              setImages((prev) => {
                const updated = [...prev, imageData];
                localStorage.setItem('gpsImages', JSON.stringify(updated));
                return updated;
              });
              resolve();
            }
          } catch (error) {
            console.error('خطأ عام:', error);
            resolve();
          }
        };
        img.onerror = function() {
          console.error('فشل تحميل الصورة');
          resolve();
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = function() {
        console.error('فشل قراءة الملف');
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  // دالة جديدة: حفظ الصورة مع موقع محدد
  const processImageWithLocation = (file: File, lat: number, lon: number): Promise<void> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const imageData: ImageData = {
          id: Date.now() + Math.random(),
          src: e.target?.result as string,
          latitude: lat,
          longitude: lon,
          filename: file.name,
          uploadDate: new Date().toISOString(),
        };

        setImages((prev) => {
          const updated = [...prev, imageData];
          localStorage.setItem('gpsImages', JSON.stringify(updated));
          return updated;
        });
        resolve();
      };
      reader.onerror = function() {
        console.error('فشل قراءة الملف');
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isCamera: boolean) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setLoading(true);
    
    // إذا كانت من الكاميرا، نحصل على الموقع الحالي
    if (isCamera && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // لدينا الموقع! نضيفه للصورة
          for (const file of files) {
            await processImageWithLocation(file, position.coords.latitude, position.coords.longitude);
          }
          setLoading(false);
          showStatus('تم التقاط الصورة مع الموقع! 📍');
          e.target.value = '';
        },
        async (error) => {
          // فشل الحصول على الموقع - نحفظ الصورة بدون GPS
          console.error('خطأ في الموقع:', error);
          for (const file of files) {
            await processImage(file);
          }
          setLoading(false);
          showStatus('تم التقاط الصورة (بدون موقع) 📸');
          e.target.value = '';
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      // من المعرض - نعالج عادي ونحاول نستخرج GPS
      for (const file of files) {
        await processImage(file);
      }
      setLoading(false);
      showStatus('تم رفع الصور بنجاح! ✅');
      e.target.value = '';
    }
  };

  const deleteImage = (index: number) => {
    if (confirm('هل أنت متأكد من حذف هذه الصورة؟')) {
      const updated = images.filter((_, i) => i !== index);
      setImages(updated);
      localStorage.setItem('gpsImages', JSON.stringify(updated));
      showStatus('تم حذف الصورة ✅');
    }
  };

  const createCompositeImage = async (imageData: ImageData): Promise<Blob> => {
    return new Promise(async (resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const img = new Image();
      img.onload = async function () {
        const imgWidth = 800;
        const imgHeight = (img.height / img.width) * imgWidth;
        const mapHeight = 400;
        const padding = 40;
        const textHeight = 100;

        canvas.width = imgWidth;
        canvas.height = imgHeight + mapHeight + textHeight + padding * 3;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, imgWidth, imgHeight);

        const gradient = ctx.createLinearGradient(0, imgHeight + padding, 0, imgHeight + padding + mapHeight);
        gradient.addColorStop(0, '#004E89');
        gradient.addColorStop(1, '#1A1F3A');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, imgHeight + padding, imgWidth, mapHeight);

        ctx.beginPath();
        ctx.arc(imgWidth / 2, imgHeight + padding + mapHeight / 2, 30, 0, 2 * Math.PI);
        ctx.fillStyle = '#FF6B35';
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Cairo, Tajawal, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('📍 الموقع الجغرافي', imgWidth / 2, imgHeight + padding + mapHeight / 2 - 60);

        ctx.font = 'bold 32px Cairo, Tajawal, Arial';
        const locationText = `${imageData.latitude?.toFixed(6)}, ${imageData.longitude?.toFixed(6)}`;
        ctx.fillText(locationText, imgWidth / 2, imgHeight + padding + mapHeight + padding + 50);

        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.95);
      };

      img.src = imageData.src;
    });
  };

  const shareImage = async (index: number) => {
    const imageData = images[index];
    showStatus('جاري إنشاء الصورة المركبة... ⏳');

    try {
      const compositeBlob = await createCompositeImage(imageData);

      if (navigator.share && navigator.canShare) {
        const file = new File([compositeBlob], `موقع_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'مشاركة الموقع',
            text: `الموقع: ${imageData.latitude?.toFixed(6)}, ${imageData.longitude?.toFixed(6)}`,
          });
          showStatus('تم المشاركة بنجاح! ✅');
        } else {
          downloadImage(compositeBlob);
        }
      } else {
        downloadImage(compositeBlob);
      }
    } catch (error) {
      console.error('خطأ في المشاركة:', error);
      showStatus('حدث خطأ في المشاركة ❌');
    }
  };

  const downloadImage = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `موقع_${Date.now()}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('تم حفظ الصورة في التنزيلات! 📥');
  };

  return (
    <>
      <Head>
        <title>مشارك المواقع - GPS Image Sharer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&family=Cairo:wght@300;400;600;700;900&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://cdn.jsdelivr.net/npm/exif-js" async></script>
      </Head>

      <div className="min-h-screen" dir="rtl">
        {statusMessage && (
          <div className="status-message show">
            {statusMessage}
          </div>
        )}

        <div className="container">
          <header className="header">
            <h1>📍 مشارك المواقع</h1>
            <p className="subtitle">ارفع صورك واحصل على موقعها الجغرافي - شارك بضغطة واحدة</p>
          </header>

          <div className="upload-section">
            <div className="upload-area">
              <span className="upload-icon">📸</span>
              <h2 style={{ marginBottom: '15px', fontFamily: 'Cairo, sans-serif' }}>أضف صورك</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                اسحب الصور هنا أو اختر من الأزرار أدناه
              </p>

              <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="upload-btn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ flex: 1, minWidth: '200px' }}
                >
                  <span style={{ position: 'relative', zIndex: 1 }}>🖼️ اختيار من المعرض</span>
                </button>

                <button
                  className="upload-btn camera-btn"
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    background: 'linear-gradient(135deg, var(--accent) 0%, #E8A000 100%)',
                  }}
                >
                  <span style={{ position: 'relative', zIndex: 1 }}>📷 التقاط صورة الآن</span>
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFileChange(e, false)}
              style={{ display: 'none' }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileChange(e, true)}
              style={{ display: 'none' }}
            />
          </div>

          {loading && (
            <div className="loading" style={{ display: 'block' }}>
              <div className="spinner"></div>
              <p style={{ marginTop: '15px' }}>جاري معالجة الصور...</p>
            </div>
          )}

          <div className="gallery">
            {images.map((img, index) => (
              <div key={img.id} className="image-card" style={{ animationDelay: `${index * 0.1}s` }}>
                <img src={img.src} alt="صورة" className="image-preview" />
                <div className="map-container" id={`map-${img.id}`}>
                  {img.latitude && img.longitude && <MapComponent lat={img.latitude} lon={img.longitude} />}
                </div>
                <div className="card-info">
                  <div className="location-text">
                    {img.latitude && img.longitude
                      ? `📍 ${img.latitude.toFixed(6)}, ${img.longitude.toFixed(6)}`
                      : '⚠️ لا توجد بيانات GPS في هذه الصورة'}
                  </div>
                  {img.latitude && img.longitude ? (
                    <button className="share-btn" onClick={() => shareImage(index)}>
                      📤 مشاركة الصورة مع الموقع
                    </button>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      هذه الصورة لا تحتوي على بيانات موقع
                    </p>
                  )}
                  <button className="delete-btn" onClick={() => deleteImage(index)}>
                    🗑️ حذف
                  </button>
                </div>
              </div>
            ))}
          </div>

          {images.length === 0 && !loading && (
            <div className="empty-state">
              <div className="empty-state-icon">🗺️</div>
              <h3 style={{ marginBottom: '10px', fontFamily: 'Cairo, sans-serif' }}>لا توجد صور بعد</h3>
              <p>ابدأ برفع صورك التي تحتوي على بيانات GPS</p>
            </div>
          )}
        </div>

        <style jsx global>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          :root {
            --primary: #ff6b35;
            --primary-dark: #e85a2b;
            --secondary: #004e89;
            --accent: #f7b801;
            --bg-main: #0a0e27;
            --bg-card: #1a1f3a;
            --text-light: #ffffff;
            --text-muted: #a0aec0;
            --success: #10b981;
            --shadow: rgba(255, 107, 53, 0.3);
          }

          body {
            font-family: 'Tajawal', sans-serif;
            background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0a0e27 100%);
            color: var(--text-light);
            min-height: 100vh;
            position: relative;
            overflow-x: hidden;
          }

          body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at 20% 50%, rgba(255, 107, 53, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(0, 78, 137, 0.15) 0%, transparent 50%);
            pointer-events: none;
            z-index: 0;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            position: relative;
            z-index: 1;
          }

          .header {
            text-align: center;
            padding: 40px 20px;
            background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
            border-radius: 20px;
            margin-bottom: 40px;
            box-shadow: 0 10px 40px var(--shadow);
            position: relative;
            overflow: hidden;
          }

          .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
            animation: pulse 4s ease-in-out infinite;
          }

          @keyframes pulse {
            0%,
            100% {
              transform: scale(1);
              opacity: 0.3;
            }
            50% {
              transform: scale(1.1);
              opacity: 0.5;
            }
          }

          h1 {
            font-family: 'Cairo', sans-serif;
            font-size: clamp(2rem, 5vw, 3.5rem);
            font-weight: 900;
            margin-bottom: 10px;
            text-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
            position: relative;
            z-index: 1;
          }

          .subtitle {
            font-size: 1.1rem;
            opacity: 0.95;
            font-weight: 300;
            position: relative;
            z-index: 1;
          }

          .upload-section {
            background: var(--bg-card);
            border-radius: 20px;
            padding: 40px;
            margin-bottom: 40px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border: 2px dashed var(--primary);
            transition: all 0.3s ease;
          }

          .upload-section:hover {
            border-color: var(--accent);
            box-shadow: 0 12px 48px var(--shadow);
            transform: translateY(-2px);
          }

          .upload-area {
            text-align: center;
            padding: 30px;
          }

          .upload-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            display: block;
            animation: bounce 2s ease-in-out infinite;
          }

          @keyframes bounce {
            0%,
            100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-10px);
            }
          }

          .upload-btn {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            border: none;
            padding: 15px 40px;
            font-size: 1.1rem;
            border-radius: 50px;
            cursor: pointer;
            font-family: 'Cairo', sans-serif;
            font-weight: 700;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px var(--shadow);
            position: relative;
            overflow: hidden;
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            user-select: none;
          }

          .upload-btn::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            transform: translate(-50%, -50%);
            transition: width 0.6s, height 0.6s;
          }

          .upload-btn:hover::before {
            width: 300px;
            height: 300px;
          }

          .upload-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 8px 25px var(--shadow);
          }

          .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 30px;
            margin-top: 40px;
          }

          .image-card {
            background: var(--bg-card);
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
            animation: slideUp 0.5s ease-out;
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .image-card:hover {
            transform: translateY(-8px) scale(1.02);
            box-shadow: 0 16px 48px var(--shadow);
          }

          .image-preview {
            width: 100%;
            height: 250px;
            object-fit: cover;
            background: linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%);
          }

          .map-container {
            width: 100%;
            height: 200px;
            position: relative;
          }

          .card-info {
            padding: 20px;
          }

          .location-text {
            font-size: 0.95rem;
            color: var(--text-muted);
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .share-btn {
            width: 100%;
            background: linear-gradient(135deg, var(--accent) 0%, #e8a000 100%);
            color: var(--bg-main);
            border: none;
            padding: 15px;
            font-size: 1.1rem;
            border-radius: 12px;
            cursor: pointer;
            font-family: 'Cairo', sans-serif;
            font-weight: 700;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(247, 184, 1, 0.3);
          }

          .share-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 8px 25px rgba(247, 184, 1, 0.5);
          }

          .share-btn:active {
            transform: scale(0.98);
          }

          .loading {
            display: none;
            text-align: center;
            padding: 20px;
            font-size: 1.2rem;
            color: var(--accent);
          }

          .spinner {
            display: inline-block;
            width: 40px;
            height: 40px;
            border: 4px solid rgba(247, 184, 1, 0.3);
            border-top: 4px solid var(--accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }

          .empty-state {
            text-align: center;
            padding: 80px 20px;
            color: var(--text-muted);
          }

          .empty-state-icon {
            font-size: 5rem;
            margin-bottom: 20px;
            opacity: 0.5;
          }

          .status-message {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--success);
            color: white;
            padding: 15px 30px;
            border-radius: 50px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
            font-weight: 600;
          }

          .status-message.show {
            opacity: 1;
          }

          .delete-btn {
            background: #ef4444;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-top: 10px;
            transition: all 0.3s ease;
          }

          .delete-btn:hover {
            background: #dc2626;
            transform: scale(1.05);
          }

          @media (max-width: 768px) {
            .gallery {
              grid-template-columns: 1fr;
            }

            .header {
              padding: 30px 15px;
            }

            .upload-section {
              padding: 25px 15px;
            }
          }
        `}</style>
      </div>
    </>
  );
}
