import {LAYOUT} from '../theme/tokens';
import {clamp} from '../hooks/useKeys';
import {Tile, type TileModel} from './Tile';

export type RowSize = 'normal' | 'large';

interface Props {
	label: string;
	items: TileModel[];
	focused: boolean;
	selected: number;
	emptyText?: string;
	/** large: one line of the app grid (left-aligned, never scrolls sideways) */
	size?: RowSize;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
}

const VIEWPORT_WIDTH = LAYOUT.screenWidth - 2 * LAYOUT.edgePadding;
const STEP = LAYOUT.tileSize + LAYOUT.tileGap;

/** Horizontal strip of tiles. Centred when it fits; otherwise a carousel that keeps
 *  the selected tile in the middle (clamped at the ends). Large rows are lines of the
 *  app grid: they hold at most LAYOUT.appColumns tiles and stay left-aligned. */
export function Row ({label, items, focused, selected, emptyText, size = 'normal', onSelect, onActivate}: Props) {
	const large = size === 'large';
	const total = items.length * STEP - LAYOUT.tileGap;
	const fits = large || total <= VIEWPORT_WIDTH;
	const offset = fits ? 0 : clamp(selected * STEP + LAYOUT.tileSize / 2 - VIEWPORT_WIDTH / 2, 0, total - VIEWPORT_WIDTH);
	const classes = ['row', large && 'row--large', focused && 'row--focused'].filter(Boolean).join(' ');

	return (
		<section class={classes}>
			{label && <h2 class="row__label">{label}</h2>}
			<div class="row__viewport">
				{items.length === 0
					? <div class="row__empty">{emptyText || 'Nothing here yet'}</div>
					: <div class={`row__track${fits && !large ? ' row__track--centered' : ''}`} style={{transform: `translateX(${-offset}px)`}}>
						{items.map((item, i) => (
							<Tile
								key={item.key}
								model={item}
								focused={focused && i === selected}
								onHover={() => onSelect(i)}
								onActivate={() => onActivate(i)}
							/>
						))}
					</div>}
			</div>
		</section>
	);
}
