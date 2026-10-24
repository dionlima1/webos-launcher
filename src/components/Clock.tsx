import {dateText, dayName, hourText, timeParts, type TimeFormat} from '../lib/clock';
import type {Weather} from '../lib/weather';
import {WeatherIcon} from './WeatherIcon';

interface Props {
	now: Date;
	format: TimeFormat;
	weather: Weather | null;
}

/** Below this chance of rain the strip doesn't mention rain at all. */
const RAIN_CHANCE_SHOWN = 20;

/** The time; under it "sábado, 24 de outubro · ☁ 24° nublado"; then the next hours. */
export function Clock ({now, format, weather}: Props) {
	const {time, period} = timeParts(now, format);
	return (
		<div class="clock">
			<div class="clock__time">
				{time}
				{period && <span class="clock__period">{period}</span>}
			</div>
			<div class="clock__date">
				{dayName(now)}, {dateText(now)}
				{weather && (
					<span class="clock__weather">
						{' · '}
						<WeatherIcon code={weather.code} isDay={weather.isDay} />
						{weather.temperature}° {weather.text}
					</span>
				)}
			</div>
			{weather && weather.hours.length > 0 && (
				<div class="forecast">
					{weather.hours.map((h) => (
						<div key={h.time.getTime()} class={`forecast__hour${h.rainChance >= 50 ? ' forecast__hour--rain' : ''}`}>
							<span class="forecast__time">{hourText(h.time, format)}</span>
							<WeatherIcon code={h.code} isDay={h.isDay} />
							<span class="forecast__temp">{h.temperature}°</span>
							<span class="forecast__rain">{h.rainChance >= RAIN_CHANCE_SHOWN ? `${h.rainChance}%` : ''}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
