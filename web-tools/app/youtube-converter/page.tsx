"use client"
import { useState, useEffect, useRef } from "react"

export default function YoutubeConverter() {
    const [url, setUrl] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = useState<number>(0)
    const [downloadSpeed, setDownloadSpeed] = useState<string>("")
    const [videoInfo, setVideoInfo] = useState<any>(null)
    const [wsConnected, setWsConnected] = useState(false)
    const wsRef = useRef<WebSocket | null>(null)
    const clientId = useRef<string>(Math.random().toString(36).substring(7))

    useEffect(() => {
        const connectWebSocket = () => {
            const ws = new WebSocket(`${process.env.NEXT_PUBLIC_FASTAPI_URL}ws/${clientId.current}`)

            ws.onopen = () => {
                console.log('WebSocket Connected')
                setWsConnected(true)
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    console.log('WebSocket message:', data) // Para debugging
                    
                    switch (data.type) {
                        case "progress":
                            setDownloadProgress(Number(data.progress) || 0)
                            if (data.speed) setDownloadSpeed(data.speed)
                            break
                        case "complete":
                            setVideoInfo(data.data)
                            setLoading(false)
                            setDownloadProgress(100)
                            setDownloadSpeed("")
                            break
                        case "error":
                            setError(data.message)
                            setLoading(false)
                            setDownloadProgress(0)
                            setDownloadSpeed("")
                            break
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error)
                }
            }

            ws.onclose = () => {
                console.log('WebSocket Disconnected')
                setWsConnected(false)
                // Intentar reconectar después de 3 segundos
                setTimeout(connectWebSocket, 3000)
            }

            ws.onerror = (error) => {
                console.error('WebSocket error:', error)
                setError('WebSocket connection error')
                setLoading(false)
            }

            wsRef.current = ws
        }

        connectWebSocket()

        return () => {
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [])

    const handleGetVideoInfo = async () => {
        try {
            if (!wsConnected) {
                throw new Error('WebSocket not connected. Please try again.')
            }

            setLoading(true)
            setError(null)
            setDownloadProgress(0)
            setDownloadSpeed("")
            setVideoInfo(null)

            const response = await fetch('/api/youtube-converter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url,
                    client_id: clientId.current 
                })
            })
            
            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || 'Failed to start download')
            }
            
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
            setLoading(false)
            setDownloadProgress(0)
            setDownloadSpeed("")
        }
    }

    return (
        <div className="p-4 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Youtube Converter</h1>
            
            {!wsConnected && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
                    Connecting to server...
                </div>
            )}
            
            <div className="flex gap-2 mb-4">
                <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)} 
                    placeholder="Enter YouTube URL"
                    className="flex-1 p-2 border rounded"
                    disabled={!wsConnected || loading}
                />
                <button 
                    onClick={handleGetVideoInfo}
                    disabled={loading || !url || !wsConnected}
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
                >
                    {loading ? 'Processing...' : 'Download'}
                </button>
            </div>
            {downloadProgress}
            {loading && (
                <div className="mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(downloadProgress, 100)}%` }}
                        ></div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                        {downloadProgress < 100 
                            ? `Downloading: ${downloadProgress.toFixed(1)}% ${downloadSpeed}`
                            : 'Processing...'}
                    </p>
                </div>
            )}

            {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
                    {error}
                </div>
            )}

            {videoInfo && (
                <div className="border rounded p-4">
                    <h2 className="font-bold">{videoInfo.title}</h2>
                    {videoInfo.thumbnail && (
                        <img 
                            src={videoInfo.thumbnail} 
                            alt={videoInfo.title}
                            className="w-full max-w-md my-2 rounded"
                        />
                    )}
                    <p>Duration: {formatDuration(videoInfo.duration)}</p>
                    <p className="text-green-500">Download complete!</p>
                    <p className="text-sm text-gray-600">Saved to: {videoInfo.file_path}</p>
                </div>
            )}
        </div>
    )
}

function formatDuration(seconds: number): string {
    if (!seconds) return "Unknown duration"
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}