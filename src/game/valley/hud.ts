// Shared between the valley's scene (which writes it every frame) and the map in the corner (which reads it):
// where the player is, and which way the camera looks (0 = north, turning clockwise)
export const tracker = { x: 0, z: 0, yaw: 0, live: false }
