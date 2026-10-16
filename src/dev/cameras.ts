// Dev-only camera data for the Live views card (see loadCameras in lib/api.ts).
import { parseCameras } from '../../tgcloud/lib/cameras-parse.js';
import type { CamerasResult } from '../lib/api';

// Real pictures from 16 Oct 2026; data.gov.sg may stop serving them, which then shows the broken-image state.
const PICTURES: [string, string][] = [
  ['2701', 'https://images.data.gov.sg/api/traffic-images/2026/10/c1805be8-82b9-4402-a584-4e94a8627417.jpg'],
  ['2702', 'https://images.data.gov.sg/api/traffic-images/2026/10/bdd7f740-bf2f-445e-a403-b29f940c9902.jpg'],
  ['2704', 'https://images.data.gov.sg/api/traffic-images/2026/10/07e00509-2e7c-42d5-b17a-9e6beb0f6bc2.jpg'],
  ['4703', 'https://images.data.gov.sg/api/traffic-images/2026/10/aa061c4b-c655-4bd5-b399-dc69f5cea60c.jpg'],
  ['4712', 'https://images.data.gov.sg/api/traffic-images/2026/10/4101de86-a6ed-4cc0-9a64-a785e10298b6.jpg'],
  ['4713', 'https://images.data.gov.sg/api/traffic-images/2026/10/1160bc2c-844d-455a-87ac-634b847c8616.jpg'],
  ['4798', 'https://images.data.gov.sg/api/traffic-images/2026/10/0a5da1e8-22c9-4053-8617-135d4863e08b.jpg'],
  ['4799', 'https://images.data.gov.sg/api/traffic-images/2026/10/d3ec9d42-3b3b-44b5-9527-001210d9d5f2.jpg'],
];

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export function demoCameras(): CamerasResult {
  const feed = { items: [{ cameras: PICTURES.map(([camera_id, image]) => ({ camera_id, image, timestamp: ago(1) })) }] };
  return { cameras: parseCameras(feed), serverTime: Date.now() };
}

/** A long unknown camera, one that stopped updating, a picture that won't load and one from the future. */
export function worstCameras(): CamerasResult {
  const cams = demoCameras().cameras!;
  return {
    cameras: [
      ...cams.slice(0, 7).map((c, i) =>
        i === 0 ? { ...c, takenAt: ago(60 * 26) }
        : i === 1 ? { ...c, image: 'https://images.data.gov.sg/api/traffic-images/2026/10/does-not-exist.jpg' }
        : i === 5 ? { ...c, takenAt: ago(-5) }
        : c,
      ),
      { id: '123456789012', name: 'Camera 123456789012 at the very long and unbreakable Ayer_Rajah_Expressway_towards_Tuas_Checkpoint', region: null, image: cams[7].image, takenAt: ago(45) },
    ],
    serverTime: Date.now(),
  };
}
