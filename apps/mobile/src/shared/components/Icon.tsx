import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName = 'home' | 'record' | 'history' | 'sensor' | 'play' | 'stop' | 'check' | 'chevron' | 'alert' | 'plus';

interface Props {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}

/** A small set of line icons drawn for this app (24×24 grid), so the UI needs no icon-font dependency. */
export function Icon({ name, color, size = 24, strokeWidth = 2 }: Props) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'home' && <Path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z" {...stroke} />}
      {name === 'record' && <Path d="M2.5 12h4l2.5-6 5 12 2.5-6h5" {...stroke} />}
      {name === 'history' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...stroke} />
          <Path d="M12 7.5V12l3 2" {...stroke} />
        </>
      )}
      {name === 'sensor' && (
        <>
          <Circle cx={12} cy={12} r={2} fill={color} />
          <Path d="M8 8a5.6 5.6 0 0 0 0 8M16 8a5.6 5.6 0 0 1 0 8M5 5a9.9 9.9 0 0 0 0 14M19 5a9.9 9.9 0 0 1 0 14" {...stroke} />
        </>
      )}
      {name === 'play' && <Path d="M8 5.5v13l10.5-6.5z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />}
      {name === 'stop' && <Rect x={6.5} y={6.5} width={11} height={11} rx={2.5} fill={color} />}
      {name === 'check' && <Path d="M5 12.5 9.5 17 19 7.5" {...stroke} />}
      {name === 'chevron' && <Path d="m9.5 6 6 6-6 6" {...stroke} />}
      {name === 'alert' && <Path d="M12 4 2.8 19.5h18.4zM12 10v4M12 16.8v.2" {...stroke} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} />}
    </Svg>
  );
}
