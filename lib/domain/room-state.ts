import { RoomStatus } from "../types"

export const ROOM_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  [RoomStatus.AVAILABLE]: [RoomStatus.OCCUPIED, RoomStatus.RESERVED, RoomStatus.MAINTENANCE],
  [RoomStatus.RESERVED]: [RoomStatus.OCCUPIED, RoomStatus.AVAILABLE, RoomStatus.MAINTENANCE],
  [RoomStatus.OCCUPIED]: [RoomStatus.CLEANING],
  [RoomStatus.CLEANING]: [RoomStatus.AVAILABLE, RoomStatus.MAINTENANCE],
  [RoomStatus.MAINTENANCE]: [RoomStatus.AVAILABLE],
}

export function canTransitionRoom(from: RoomStatus, to: RoomStatus): boolean {
  return ROOM_TRANSITIONS[from].includes(to)
}
