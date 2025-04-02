import { NextResponse } from 'next/server'

const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL

export async function POST(request: Request) {
    /*
    This function is used to download a video from YouTube and return the video information.
    It uses the fastapi app to download the video and then returns the video information.
    */
    try {
        const { url, client_id } = await request.json()
        
        if (!url || !client_id) {
            return NextResponse.json(
                { error: 'URL and client_id are required' },
                { status: 400 }
            )
        }

        const response = await fetch(`${fastapiUrl}download/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url, client_id })
        })

        if (!response.ok) {
            const errorData = await response.json()
            return NextResponse.json(
                { error: errorData.detail || 'Failed to process video' },
                { status: response.status }
            )
        }

        const data = await response.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Error in POST route:', error)
        return NextResponse.json(
            { error: 'Failed to process video' },
            { status: 500 }
        )
    }
} 