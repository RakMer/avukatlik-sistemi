# Avukatlık Sistemi - Sunucu Kurulum (Deployment) Rehberi

Sistemi dış sunucuya kurmak (deploy etmek) için aşağıdaki adımları sırasıyla uygulamanız yeterlidir. Yerel ortamımızdaki n8n iptal edilip, kodlar uzak n8n ile entegre çalışacak şekilde güncellenmiştir.

## 1. Sunucu Ön Hazırlığı
Sunucunuzda **Git**, **Docker** ve **Docker Compose** kurulu olmalıdır.
*(Ubuntu/Debian sunucular için kurulum komutları: `sudo apt install docker.io docker-compose git`)*

## 2. Projeyi Sunucuya Çekme
Sistemin kaynak kodlarını sunucuya indirin. Eğer Github vb. bir serviste barındırıyorsanız git kullanarak indirebilirsiniz. (Eğer henüz github'a atmadıysanız, dosyaları FTP/SCP ile sunucuya kopyalayın).

```bash
git clone <projenizin-repo-linki>
cd avukatlik-sistemi
```

## 3. Ortam Değişkenlerini (Environment Variables) Ayarlama
Projenin ana dizininde `.env` isimli bir dosya oluşturup aşağıdaki değişkenleri doldurun.

```bash
nano .env
```

`.env` dosyasının içeriği şu şekilde olmalıdır:
```env
# Veritabanı Ayarları
DB_USER=postgres
DB_PASSWORD=kendi_guvenli_parolaniz
DB_NAME=avukat_db

# Uygulama Ayarları
PORT=3001
NODE_ENV=production

# Telegram Ayarları (Bildirim servisi için)
TELEGRAM_BOT_TOKEN=123456789:AAXXXXXXXXXX

# GCS Backup Ayarları (Yedekleme)
GCS_BUCKET=sizin-bucket-adiniz
BACKUP_CRON=0 3 * * *

# n8n Bildirim Tetikleme (Hatırlatıcı webhook URL'si)
# RakmerSoftware n8n sunucunuzdaki "Hatırlatıcı Akışının (Reminder Workflow)" Webhook URL'si
N8N_REMINDER_URL=https://n8n.rakmersoftware.com/webhook/reminder
```

## 4. Yedekleme (Backup) Kimlik Doğrulama Bilgilerini Ayarlama
Eğer Google Cloud Storage'a günlük yedekleme alınmasını istiyorsanız, Google'dan indirdiğiniz JSON Service Account dosyasını sunucuda şu dizine koyun:
`secrets/gcs-key.json`

Eğer sırları (`secrets` dizinini) henüz oluşturmadıysanız:
```bash
mkdir -p secrets
# gcs-key.json dosyasını secrets dizini içerisine atın.
```

## 5. Uygulamayı Başlatma
Tüm ayarlar tamamsa uygulamayı Docker ile ayağa kaldırın:
```bash
docker-compose up --build -d
```
Kurulum bittiğinde `docker-compose ps` komutuyla 4 adet container'ın (`postgres`, `redis`, `case-service`, `notification-service`, `db-backup`) "Up" durumunda olduğunu doğrulayın.

---

## 6. N8n Webhook Güncellemeleri (Çok Önemli!)
Kendi n8n sunucunuz (`n8n.rakmersoftware.com`) artık bizim servislerimiz ile konuşmak zorunda. Bu yüzden n8n üzerindeki İş Akışınızda (Workflow) ufak bir değişiklik yapmalısınız:

1. Kendi n8n panelinize gidin.
2. İş akışındaki **HTTP Request** (Send to Case Service) düğümüne çift tıklayın.
3. Eskiden lokaldeki `http://case-service:3001/api/webhook/telegram-ai` olan URL'yi, **bu projeyi deploy ettiğiniz sunucunun Dışarıya Açık Adresi (Public IP/Domain)** ile değiştirin.
   * *Örnek:* `http://SizinSunucuIPAdresi:3001/api/webhook/telegram-ai` veya `https://api.sizin-domaininiz.com/api/webhook/telegram-ai`
4. Güncelleştirmeyi kaydedin (Active edin).

Artık sisteminiz hazır. Telegram'dan botunuza görsel attığınızda dış sunucunuz n8n üzerinden belgeyi algılayıp backend'e sorunsuz aktaracaktır.
