/**
 * LiveKit WebRTC helpers — connection + microphone capture.
 * Voice pipeline wiring points are marked for VAD / STT / playback.
 */
import { Room, RoomEvent, Track } from 'livekit-client'

export interface ConnectOptions {
  url: string
  token: string
}

export async function connectToVoiceRoom({ url, token }: ConnectOptions): Promise<Room> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  })

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) {
      // Remote agent audio arrives here → pipe to playback element.
      track.attach()
    }
  })

  await room.connect(url, token)
  return room
}

export async function disconnectFromRoom(room: Room): Promise<void> {
  await room.disconnect()
}

export async function publishMicrophone(room: Room): Promise<void> {
  // TODO: tap the local audio track here for client-side VAD and/or
  // stream frames to the FastAPI /ws/voice socket for server-side VAD.
  await room.localParticipant.setMicrophoneEnabled(true)
}

export async function getMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
}
