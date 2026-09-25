import QRCode from 'react-qr-code'

export default function GameJoinQRCode({ code }) {
  const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin
  const url = new URL(baseUrl)
  url.searchParams.set('join', '1')
  url.searchParams.set('code', code || '')

  if (!code) {
    return (
      <div className="qr-code-shell qr-code-empty" aria-label="Game join QR code unavailable">
        <span>Generating QR...</span>
      </div>
    )
  }

  return (
    <div className="qr-code-shell" aria-label="Game join QR code">
      <QRCode value={url.toString()} size={150} bgColor="#ffffff" fgColor="#0d163d" />
      <p className="qr-code-label">Scan to join</p>
    </div>
  )
}
