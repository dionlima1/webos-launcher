// Small line icons for WMO weather codes, drawn in SVG (the TV has no colour emoji).

type Kind = 'clear' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'heavy' | 'snow' | 'storm';

function kindOf (code: number): Kind {
	if (code === 0) return 'clear';
	if (code === 1 || code === 2) return 'partly';
	if (code === 3) return 'cloud';
	if (code === 45 || code === 48) return 'fog';
	if (code >= 51 && code <= 57) return 'drizzle';
	if (code === 65 || code === 67 || code === 82) return 'heavy';
	if ((code >= 61 && code <= 67) || code === 80 || code === 81) return 'rain';
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
	if (code >= 95) return 'storm';
	return 'cloud';
}

const CLOUD = 'M9.5 25h13a5.5 5.5 0 0 0 .8-10.95A7.5 7.5 0 0 0 9.1 16.2 4.5 4.5 0 0 0 9.5 25z';
const SMALL_CLOUD = 'M11 26h11.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 11.6 18.6 3.8 3.8 0 0 0 11 26z';

function Sun ({cx, cy, r}: {cx: number; cy: number; r: number}) {
	const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
		const rad = a * Math.PI / 180;
		return <line key={a} x1={cx + Math.cos(rad) * (r + 2.5)} y1={cy + Math.sin(rad) * (r + 2.5)} x2={cx + Math.cos(rad) * (r + 5)} y2={cy + Math.sin(rad) * (r + 5)} />;
	});
	return <g class="wx-sun"><circle cx={cx} cy={cy} r={r} />{rays}</g>;
}

function Moon ({cx, cy, r}: {cx: number; cy: number; r: number}) {
	return <path class="wx-moon" d={`M${cx + r * 0.3} ${cy - r} a${r} ${r} 0 1 0 ${r * 0.7} ${r * 1.7} a${r * 0.8} ${r * 0.8} 0 0 1 -${r * 0.7} -${r * 1.7}z`} />;
}

function Drops ({count, long}: {count: number; long: boolean}) {
	const xs = count === 3 ? [12, 16.5, 21] : [10.5, 14, 17.5, 21, 24.5];
	return <g class="wx-rain">{xs.map((x) => <line key={x} x1={x} y1={long ? 27 : 27.5} x2={x - 1.5} y2={long ? 31 : 29.5} />)}</g>;
}

/** `isDay` picks sun or moon for clear and partly cloudy skies. */
export function WeatherIcon ({code, isDay}: {code: number; isDay: boolean}) {
	const kind = kindOf(code);
	return (
		<svg class="wx" viewBox="0 0 32 32" aria-hidden="true">
			{kind === 'clear' && (isDay ? <Sun cx={16} cy={16} r={6} /> : <Moon cx={15} cy={16} r={8} />)}
			{kind === 'partly' && (isDay ? <Sun cx={12} cy={11} r={4.5} /> : <Moon cx={11} cy={11} r={6} />)}
			{kind === 'partly' && <path class="wx-cloud wx-cloud--front" d={SMALL_CLOUD} />}
			{kind !== 'clear' && kind !== 'partly' && kind !== 'fog' && <path class="wx-cloud" d={CLOUD} transform={kind === 'cloud' ? '' : 'translate(0 -4)'} />}
			{kind === 'fog' && <g class="wx-cloud"><line x1="6" y1="12" x2="26" y2="12" /><line x1="4" y1="17" x2="24" y2="17" /><line x1="8" y1="22" x2="28" y2="22" /></g>}
			{kind === 'drizzle' && <Drops count={3} long={false} />}
			{kind === 'rain' && <Drops count={3} long />}
			{kind === 'heavy' && <Drops count={5} long />}
			{kind === 'snow' && <g class="wx-snow"><circle cx="12" cy="28" r="1.2" /><circle cx="17" cy="29.5" r="1.2" /><circle cx="22" cy="28" r="1.2" /></g>}
			{kind === 'storm' && <path class="wx-bolt" d="M17 20l-4 6h4l-2 5 6-8h-4l2-3z" />}
		</svg>
	);
}
