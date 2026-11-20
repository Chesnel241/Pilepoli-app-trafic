import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

type P = { size?: number; color?: string };

export const IconBack = ({ size = 22, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const IconClose = ({ size = 20, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconSearch = ({ size = 22, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round">
    <Circle cx={11} cy={11} r={7} />
    <Path d="M20 20l-3.5-3.5" />
  </Svg>
);
export const IconPin = ({ size = 18, color = colors.violet }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <Circle cx={12} cy={9.5} r={2.5} />
  </Svg>
);
export const IconHome = ({ size = 26, color = '#FFFFFF' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 11l9-7 9 7M5 9.5V20h14V9.5" />
  </Svg>
);
export const IconWork = ({ size = 26, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={3} y={7} width={18} height={13} rx={2} />
    <Path d="M8 7V5h8v2" />
  </Svg>
);
export const IconWalk = ({ size = 20, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={13} cy={4.5} r={1.8} />
    <Path d="M12 8.5l-2 5 3 2.5 1 5M10 13.5l-3 2M12.5 10l3 2.5 2.5-.5" />
  </Svg>
);
export const IconCheck = ({ size = 12, color = '#FFFFFF' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconFlag = ({ size = 14, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 21V4M6 4h11l-2 4 2 4H6" />
  </Svg>
);
export const IconArrowLeft = ({ size = 22, color = colors.lime }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const IconEscalator = ({ size = 22, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 19h5l8-12h5" />
    <Path d="M16 4l4 3-4 3" />
  </Svg>
);
