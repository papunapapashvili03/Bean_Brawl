import {
  BallCollider,
  ConeCollider,
  CylinderCollider,
  RigidBody,
  type RigidBodyProps,
} from '@react-three/rapier'

type ShapeProps = Omit<RigidBodyProps, 'children' | 'colliders'> & { color: string }

export function Ball({ radius = 0.8, color, ...body }: ShapeProps & { radius?: number }) {
  return (
    <RigidBody colliders={false} {...body}>
      <BallCollider args={[radius]} />
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  )
}

export function Cylinder({
  radius = 0.7,
  height = 1.4,
  color,
  ...body
}: ShapeProps & { radius?: number; height?: number }) {
  return (
    <RigidBody colliders={false} {...body}>
      <CylinderCollider args={[height / 2, radius]} />
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  )
}

export function Cone({
  radius = 0.8,
  height = 1.6,
  color,
  ...body
}: ShapeProps & { radius?: number; height?: number }) {
  return (
    <RigidBody colliders={false} {...body}>
      <ConeCollider args={[height / 2, radius]} />
      <mesh castShadow receiveShadow>
        <coneGeometry args={[radius, height, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  )
}

// Straight prism with a regular polygon cross-section: 3 = triangle, 6 = hexagon.
// Convex, so a hull collider built from the mesh vertices matches it exactly.
export function Prism({
  sides,
  radius = 0.8,
  height = 1,
  color,
  ...body
}: ShapeProps & { sides: number; radius?: number; height?: number }) {
  return (
    <RigidBody colliders="hull" {...body}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, sides]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </RigidBody>
  )
}
