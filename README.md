<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,50:0a1628,100:0d1117&height=160&section=header&text=E-Kilit&fontSize=60&fontColor=58a6ff&fontAlignY=55&desc=Ak%C4%B1ll%C4%B1%20Tahta%20G%C3%BCvenlik%20ve%20Y%C3%B6netim%20Sistemi&descSize=18&descAlignY=78&descColor=8b949e"/>

<div align="center">

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&size=14&pause=900&color=58A6FF&center=true&vCenter=true&width=600&lines=USB+Anahtar+%7C+QR+Kod+%7C+Uzaktan+Ki%C3%B6sk+Y%C3%B6netimi;Ger%C3%A7ek+Zamanl%C4%B1+WebSocket+%C4%B0leti%C5%9Fimi;Electron+%7C+Next.js+%7C+Fastify+%7C+React+Native;Developed+by+Xren+Software)](https://git.io/typing-svg)

[![Backend](https://img.shields.io/badge/API-Node.js-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Panel](https://img.shields.io/badge/Panel-Next.js-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![Desktop](https://img.shields.io/badge/Desktop-Electron-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org)
[![Tahta](https://img.shields.io/badge/Tahta-C%23_WinForms-512BD4?style=flat-square&logo=dotnet&logoColor=white)](https://dotnet.microsoft.com)
[![Mobil](https://img.shields.io/badge/Mobil-React_Native-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev)
[![Lisans](https://img.shields.io/badge/Lisans-MIT-green?style=flat-square)](LICENSE)

</div>
<p align="center">
  <strong>🔒 E-Kilit</strong> — Okullardaki akıllı tahtaları merkezi olarak kilitleyin, izleyin ve yönetin.<br>
  <em>Developed by <a href="https://xrensoftware.net">Xren Software</a></em>
</p>

---

## 📖 Proje Hakkında

E-Kilit, okullardaki akıllı tahtaları yetkisiz kullanıma karşı kilitleyen, öğretmenlerin USB anahtarı veya mobil uygulama (QR kod) ile kilidi açmasını sağlayan ve yöneticilerin tüm tahtaları canlı olarak takip edip uzaktan yönetebildiği bir ekosistemdir.

## 🏗️ Mimari

```
ekilitprog/
├── api/              → REST API + WebSocket Backend (Node.js, Express, Socket.IO, Sequelize)
├── admin/            → Yönetim Paneli Web Arayüzü (Next.js 14, App Router)
├── admin-desktop/    → Yönetim Paneli Masaüstü Uygulaması (C# WinForms, WebView2)
├── board/            → Akıllı Tahta Kilit İstemcisi (C# WinForms, WebView2, Kiosk Mode)
└── mobile/           → Mobil QR Tarayıcı Uygulaması (React Native, Expo)
```

## 🔐 4 Kilit Açma Yöntemi

| # | Yöntem | Açıklama |
|---|--------|----------|
| 1 | **USB Anahtar** | Öğretmene atanmış USB flash bellek (seri numara SHA-256 ile hashlenir) |
| 2 | **Mobil QR Kod** | Öğretmen hesabıyla mobil uygulamadan QR tarama (40 dk'da bir yenilenir) |
| 3 | **Uzaktan Açma** | Müdürün admin panelinden WebSocket ile uzaktan açması |
| 4 | **Master Key** | Süper yönetici master anahtarı (bcrypt ile hashlenir) |

## ⚡ Özellikler

- ✅ Gerçek zamanlı WebSocket iletişimi (Socket.IO)
- ✅ Periyodik ekran görüntüsü izleme
- ✅ USB seri numarası ile kilit açma (WMI entegrasyonu)
- ✅ QR kod ile mobil kilit açma (dinamik token)
- ✅ Uzaktan kilit açma / kilitleme
- ✅ Kiosk modu (Alt+F4, Task Manager, Windows tuşu engelleme)
- ✅ Çevrimdışı (offline) USB doğrulama desteği
- ✅ Kişiye özel USB anahtar yönetimi
- ✅ Detaylı raporlar ve CSV dışa aktarma
- ✅ 90 günde otomatik log temizleme
- ✅ 50MB'a kadar dosya aktarımı
- ✅ Site whitelist/blacklist kuralları
- ✅ Kilit ekranında duyuru sistemi (marquee)
- ✅ Okul bazlı yetkilendirme (RBAC: SuperAdmin > Principal > Teacher)
- ✅ Lisans yönetim sistemi

## 🔒 Güvenlik

- JWT + Refresh Token kimlik doğrulama (HttpOnly Cookie)
- Rol tabanlı erişim kontrolü (RBAC)
- USB seri numara hashleme (SHA-256)
- Master Key şifreleme (bcrypt)
- Rate limiting
- CORS koruması
- Kiosk mode (Low Level Keyboard Hook, Registry manipülasyonu)

---

## 🚀 Kurulum

### Gereksinimler

- **Node.js** 18+ (API & Admin Panel)
- **.NET 8 SDK** (Tahta İstemcisi & Admin Desktop)
- **Expo CLI** (Mobil Uygulama)
- **MySQL 8** (Production) veya **SQLite** (Geliştirme)

### 1. API Backend

```bash
cd api
cp .env.example .env        # Ayarlarınızı düzenleyin
npm install
npm run dev
```

> API varsayılan olarak `http://localhost:3000` adresinde çalışır.
> SQLite modunda veritabanı dosyası otomatik oluşturulur.
> MySQL kullanmak için `.env` dosyasında `DB_DIALECT=mysql` yapın ve bağlantı bilgilerini girin.

**İlk çalıştırmada oluşturulan varsayılan hesaplar:**

| Rol | E-posta | Şifre |
|-----|---------|-------|
| SuperAdmin | admin@e-kilit.com | admin123 |
| Müdür | mudur@demo.e-kilit.com | mudur123 |
| Öğretmen | ogretmen@demo.e-kilit.com | ogretmen123 |

**Master Key:** `ekilit-master-2024`

> ⚠️ **Üretim ortamında bu varsayılan değerleri mutlaka değiştirin!**

### 2. Yönetim Paneli (Web)

```bash
cd admin
cp .env.local.example .env.local   # API adresini düzenleyin
npm install
npm run dev
```

> Panel `http://localhost:3001` adresinde açılır.

### 3. Yönetim Paneli (Masaüstü — Opsiyonel)

```bash
cd admin-desktop
dotnet build
dotnet run
```

> Admin panel web arayüzünü WebView2 içinde bir masaüstü uygulaması olarak çalıştırır.
> Önce `admin/` projesini `npm run build` ile derleyip `out/` çıktısını `wwwroot/` altına kopyalamanız gerekir.

### 4. Akıllı Tahta İstemcisi

```bash
cd board
dotnet publish -c Release -r win-x64 --self-contained
```

> Derlenen uygulama akıllı tahtaya kurulur. İlk açılışta okul kodu ve tahta adı girilerek sisteme kaydedilir.
> **Not:** WebView2 Runtime'ın hedef bilgisayarda yüklü olması gerekir.

### 5. Mobil Uygulama

```bash
cd mobile
npm install
npx expo start
```

> `mobile/api.js` dosyasındaki `API_BASE` adresini kendi sunucunuzun IP'si ile değiştirin.

---

## 📡 API Endpoints

| Kategori | Yol | Yetki |
|----------|-----|-------|
| Kimlik Doğrulama | `/auth/*` | Herkese açık |
| Okullar | `/schools/*` | SuperAdmin |
| Kullanıcılar | `/users/*` | Principal+ |
| Tahtalar | `/boards/*` | Principal+ / Board Token |
| Kilit Açma | `/unlock/*` | Yönteme göre |
| USB Anahtarları | `/usb-keys/*` | Principal+ |
| Raporlar | `/reports/*` | Principal+ |
| Dosyalar | `/files/*` | Principal+ |
| Duyurular | `/announcements/*` | Principal+ |
| Site Kuralları | `/site-rules/*` | Principal+ |
| Lisanslar | `/licenses/*` | SuperAdmin |

## 🗄️ Veritabanı Şeması

| Tablo | Açıklama |
|-------|----------|
| `Schools` | Okul bilgileri (kod, ad, adres) |
| `Users` | Kullanıcılar (email, şifre hash, rol) |
| `Boards` | Akıllı tahtalar (token, MAC, QR token, durum) |
| `UsbKeys` | USB anahtarları (seri hash, durum) |
| `UnlockLogs` | Kilit açma logları (yöntem, zaman, IP) |
| `Announcements` | Duyurular |
| `SiteRules` | Site whitelist/blacklist kuralları |
| `Licenses` | Lisans bilgileri |
| `MasterKeys` | Master key hashları |

---

## 🤝 Katkıda Bulunma

1. Bu repoyu fork edin
2. Yeni bir branch oluşturun (`git checkout -b feature/ozellik-adi`)
3. Değişikliklerinizi commit edin (`git commit -m 'Yeni özellik eklendi'`)
4. Branch'inizi push edin (`git push origin feature/ozellik-adi`)
5. Pull Request açın

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır. © 2024 [Xren Software](https://xrensoftware.net)

---

"# ekilit" 
"# ekilit" 
"# ekilit" 
