import React, { Suspense, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

function STLModel({ url, onClick }) {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry} onClick={onClick}>
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}

export default function STLViewer({ url }) {
  const [details, setDetails] = useState(null);

  const handleMeshClick = (event) => {
    // Example: Show bounding box size
    const geometry = event.object.geometry;
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    setDetails({
      min: bbox.min,
      max: bbox.max,
      size: {
        x: bbox.max.x - bbox.min.x,
        y: bbox.max.y - bbox.min.y,
        z: bbox.max.z - bbox.min.z,
      }
    });
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [0, 0, 100] }}>
        <ambientLight />
        <pointLight position={[10, 10, 10]} />
        <Suspense fallback={null}>
          <STLModel url={url} onClick={handleMeshClick} />
        </Suspense>
        <OrbitControls />
      </Canvas>
      {details && (
        <div className="absolute top-2 right-2 bg-white p-2 rounded shadow text-xs z-10">
          <div><b>Bounding Box:</b></div>
          <div>Min: {JSON.stringify(details.min)}</div>
          <div>Max: {JSON.stringify(details.max)}</div>
          <div>Size: {JSON.stringify(details.size)}</div>
        </div>
      )}
    </div>
  );
}