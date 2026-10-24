import {useEffect, useRef} from 'preact/hooks';

export interface OptionItem {
	id: string;
	label: string;
	description: string;
	/** an on/off switch */
	value: boolean;
	/** a choice instead of a switch: the current one, changed with OK or ◀ ▶ */
	choice?: string;
	/** shown dimmed (e.g. a screensaver option while the screensaver is off) */
	dimmed?: boolean;
}

interface Props {
	options: OptionItem[];
	focused: boolean;
	selected: number;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
}

/** Vertical list of options: switches, and choices that step through their values.
 *  Taller than the screen, it scrolls to keep the selected option in view. */
export function OptionList ({options, focused, selected, onSelect, onActivate}: Props) {
	const box = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const list = box.current;
		const row = list && (list.children[selected] as HTMLElement | undefined);
		if (!list || !row) return;
		const top = row.offsetTop - 12;
		const bottom = row.offsetTop + row.offsetHeight + 12;
		if (top < list.scrollTop) list.scrollTop = top;
		else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
	}, [selected]);

	return (
		<div class="options" ref={box}>
			{options.map((o, i) => (
				<div
					key={o.id}
					class={`option${focused && i === selected ? ' option--focused' : ''}${o.dimmed ? ' option--dimmed' : ''}`}
					onMouseEnter={() => onSelect(i)}
					onClick={() => onActivate(i)}
				>
					<div class="option__text">
						<div class="option__label">{o.label}</div>
						<div class="option__description">{o.description}</div>
					</div>
					{o.choice !== undefined
						? <div class="choice"><span class="choice__arrow">◀</span>{o.choice}<span class="choice__arrow">▶</span></div>
						: (
							<div class={`switch${o.value ? ' switch--on' : ''}`} role="switch" aria-checked={o.value}>
								<div class="switch__knob" />
							</div>
						)}
				</div>
			))}
		</div>
	);
}
