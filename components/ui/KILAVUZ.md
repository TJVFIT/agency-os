# Bileşen Kılavuzu (components/ui)

Bu klasördeki 8 bileşen 21st.dev'den alınıp Agency OS'un **tek renk şablonuna**
uyarlandı: OLED zemin (`#050505`), indigo vurgu (`#6366f1` / `#818cf8`), cam
yüzeyler ve ince kenarlıklar. Hiçbir bileşende emoji yoktur; ikonlar
`lucide-react`'ten gelir.

Canlı önizleme: **`/preview/ui-lab`** (menüde "Bileşenler").

## Kurulum notları

- Renk anahtarları (`primary`, `muted`, `border`, `card`, `destructive`, `ring`)
  `app/globals.css` içindeki `@theme inline` bloğuna eklendi. Bileşenler bu
  anahtarları kullandığı için otomatik olarak şablona uyar.
- `cn()` yardımcısı `lib/utils.ts` içindedir.
- Yüklenen paketler: `gsap`, `framer-motion`, `clsx`, `tailwind-merge`,
  `class-variance-authority`, `lucide-react`, `@paper-design/shaders`.

---

## 1. Card Fan Carousel — `card-fan-carousel.tsx`

Kartları yelpaze gibi açan, fareyle etkileşimli galeri. Kart sayısı 7'yi
geçince otomatik sayfalama (oklar + noktalar) çıkar.

- **Dışa aktarım:** `default` (`SocialCards`)
- **Props:** `cards: { imgUrl: string; alt?: string; linkUrl?: string }[]`
- **Not:** kart boyutları `globals.css` içindeki `.fan-card` / `.fan-layout`
  kurallarıyla belirlenir.

```tsx
import SocialCards from '@/components/ui/card-fan-carousel';

<SocialCards
  cards={[
    { imgUrl: '/ornek-1.jpg', alt: 'Gönderi 1' },
    { imgUrl: '/ornek-2.jpg', alt: 'Gönderi 2', linkUrl: '/cards/123' },
  ]}
/>;
```

---

## 2. Animated Glowing Search Bar — `animated-glowing-search-bar.tsx`

Odaklanınca dönen indigo–menekşe ışıması olan arama çubuğu.

- **Dışa aktarım:** `default` (`SearchComponent`)
- **Props:** yok (salt görsel)
- **Not:** gerçek arama için içindeki `<input>` bir `value`/`onChange`'e
  bağlanmalıdır; şu haliyle yalnızca görünümdür.

```tsx
import SearchComponent from '@/components/ui/animated-glowing-search-bar';

<SearchComponent />;
```

---

## 3. Flow Field Background — `flow-field-background.tsx`

Fareye tepki veren, akış alanı (flow field) parçacık arka planı.

- **Dışa aktarım:** `default` (`NeuralBackground`)
- **Props:** `color` (varsayılan `#818cf8`), `trailOpacity` (varsayılan `0.15`),
  `particleCount` (varsayılan `600`), `speed` (varsayılan `1`), `className`
- **Not:** sarmalayan kabın yüksekliği tanımlı olmalıdır (ör. `h-72` veya
  `h-screen`).

```tsx
import NeuralBackground from '@/components/ui/flow-field-background';

<div className="relative h-72 w-full">
  <NeuralBackground color="#818cf8" trailOpacity={0.12} speed={0.9} />
</div>;
```

---

## 4. Spotlight Card — `spotlight-card.tsx`

Fare imlecini takip eden ışıklı kenarlığa sahip kart.

- **Dışa aktarım:** `{ GlowCard }`
- **Props:** `children`, `className`, `glowColor` (`blue|purple|green|red|orange`),
  `size` (`sm|md|lg`), `width`, `height`, `customSize`

```tsx
import { GlowCard } from '@/components/ui/spotlight-card';

<GlowCard glowColor="purple" size="sm">
  <div className="flex h-full flex-col justify-end">
    <p className="text-lg font-semibold text-neutral-100">Standart</p>
  </div>
</GlowCard>;
```

---

## 5. Material Design 3 Switch — `material-design-3-switch.tsx`

Yay fiziği, morph olan tutamak ve isteğe bağlı sesli geri bildirim içeren anahtar.

- **Dışa aktarım:** `{ Switch }`
- **Props:** `checked`, `defaultChecked`, `onCheckedChange(checked)`,
  `variant` (`primary|destructive`), `size` (`default|sm`), `showIcons`,
  `checkedIcon`, `uncheckedIcon`, `haptic` (`heavy|light|none`), `disabled`

```tsx
import { Switch } from '@/components/ui/material-design-3-switch';
import { Moon, Sun } from 'lucide-react';

<Switch
  defaultChecked
  haptic="light"
  checkedIcon={<Moon className="h-3.5 w-3.5 fill-current" />}
  uncheckedIcon={<Sun className="h-3.5 w-3.5 fill-current" />}
/>;
```

---

## 6. Gooey Text Morphing — `gooey-text-morphing.tsx`

Kelimeler arasında akışkan (gooey) geçiş yapan başlık efekti.

- **Dışa aktarım:** `{ GooeyText }`
- **Props:** `texts: string[]`, `morphTime` (varsayılan `1`),
  `cooldownTime` (varsayılan `0.25`), `className`, `textClassName`

```tsx
import { GooeyText } from '@/components/ui/gooey-text-morphing';

<GooeyText texts={['Ajans', 'İçerik', 'Otomasyon', 'Yayın']} className="font-bold" />;
```

---

## 7. Ethereal Shadow — `etheral-shadow.tsx`

Dalgalanan, hue döndüren yumuşak gölge/arka plan efekti.

- **Dışa aktarım:** `{ Component }` (öneri: `import { Component as EtherealShadow }`)
- **Props:** `sizing` (`fill|stretch`), `color`, `title`,
  `animation: { scale, speed }`, `noise: { opacity, scale }`, `style`, `className`
- **Not:** `feTurbulence` SVG filtresi kullanır (GPU açısından ağırdır); tam
  ekran arka plan olarak, tek örnekle kullanın.

```tsx
import { Component as EtherealShadow } from '@/components/ui/etheral-shadow';

<div className="relative h-80 w-full">
  <EtherealShadow
    color="rgba(129, 140, 248, 0.9)"
    title="Ethereal"
    animation={{ scale: 80, speed: 65 }}
    noise={{ opacity: 0.28, scale: 1.1 }}
  />
</div>;
```

---

## 8. Liquid Metal Button — `liquid-metal-button.tsx`

WebGL shader ile sıvı metal yüzeyli, 3B basış efektli buton.

- **Dışa aktarım:** `{ LiquidMetalButton }`
- **Props:** `label` (varsayılan `"Get Started"`), `onClick`,
  `viewMode` (`text|icon`)
- **Not:** `@paper-design/shaders` paketine bağlıdır.

```tsx
import { LiquidMetalButton } from '@/components/ui/liquid-metal-button';

<LiquidMetalButton label="Başlayalım" onClick={() => {}} />
<LiquidMetalButton viewMode="icon" />;
```
