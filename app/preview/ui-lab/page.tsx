'use client';

import { Moon, Sun, Lock, Unlock } from 'lucide-react';

import SocialCards from '@/components/ui/card-fan-carousel';
import SearchComponent from '@/components/ui/animated-glowing-search-bar';
import NeuralBackground from '@/components/ui/flow-field-background';
import { GlowCard } from '@/components/ui/spotlight-card';
import { Switch } from '@/components/ui/material-design-3-switch';
import { GooeyText } from '@/components/ui/gooey-text-morphing';
import { Component as EtherealShadow } from '@/components/ui/etheral-shadow';
import { LiquidMetalButton } from '@/components/ui/liquid-metal-button';

const FAN_CARDS = [
  { imgUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&h=700&fit=crop', alt: 'Dağ manzarası' },
  { imgUrl: 'https://images.unsplash.com/photo-1511765224389-37f0e77cf0eb?w=400&h=700&fit=crop', alt: 'Gece şehir' },
  { imgUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=700&fit=crop', alt: 'Sisli orman' },
  { imgUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=700&fit=crop', alt: 'Güneşli koru' },
  { imgUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=700&fit=crop', alt: 'Tropik sahil' },
  { imgUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&h=700&fit=crop', alt: 'Yıldızlı dağ' },
  { imgUrl: 'https://images.unsplash.com/photo-1476820865390-c52aeebb9891?w=400&h=700&fit=crop', alt: 'Altın gün batımı' },
  { imgUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=400&h=700&fit=crop', alt: 'Göl yansıması' },
  { imgUrl: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400&h=700&fit=crop', alt: 'Yeşil vadi' },
];

function Stage({
  name,
  file,
  children,
  bleed = false,
}: {
  name: string;
  file: string;
  children: React.ReactNode;
  bleed?: boolean;
}) {
  return (
    <section className="animate-enter overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <header className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-neutral-200">{name}</h3>
        <code className="text-[11px] tracking-tight text-neutral-500">{file}</code>
      </header>
      <div
        className={
          bleed
            ? 'flex min-h-[18rem] items-center justify-center'
            : 'flex min-h-[16rem] items-center justify-center p-6'
        }
      >
        {children}
      </div>
    </section>
  );
}

export default function UiLabPage() {
  return (
    <div className="space-y-6">
      <div className="animate-enter">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          Bileşen Laboratuvarı
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          21st.dev bileşenleri — hepsi tek renk şablonuna (OLED zemin, indigo
          vurgu, cam yüzeyler) uyarlanmış olarak <code>components/ui/</code>{' '}
          altına eklendi. Kullanım kılavuzu: <code>components/ui/KILAVUZ.md</code>.
        </p>
      </div>

      <Stage name="Gooey Text Morphing" file="gooey-text-morphing.tsx">
        <div className="flex h-40 items-center justify-center">
          <GooeyText texts={['Ajans', 'İçerik', 'Otomasyon', 'Yayın']} className="font-bold" />
        </div>
      </Stage>

      <Stage name="Flow Field Background" file="flow-field-background.tsx" bleed>
        <div className="relative h-72 w-full">
          <NeuralBackground color="#818cf8" trailOpacity={0.12} speed={0.9} />
        </div>
      </Stage>

      <Stage name="Ethereal Shadow" file="etheral-shadow.tsx" bleed>
        <div className="relative h-80 w-full">
          <EtherealShadow
            color="rgba(129, 140, 248, 0.9)"
            title="Ethereal"
            animation={{ scale: 80, speed: 65 }}
            noise={{ opacity: 0.28, scale: 1.1 }}
            sizing="fill"
          />
        </div>
      </Stage>

      <Stage name="Spotlight Card" file="spotlight-card.tsx">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <GlowCard glowColor="purple" size="sm">
            <div className="flex h-full flex-col justify-end">
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Paket</p>
              <p className="text-lg font-semibold text-neutral-100">Standart</p>
            </div>
          </GlowCard>
          <GlowCard glowColor="blue" size="sm">
            <div className="flex h-full flex-col justify-end">
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Paket</p>
              <p className="text-lg font-semibold text-neutral-100">Pro</p>
            </div>
          </GlowCard>
          <GlowCard glowColor="green" size="sm">
            <div className="flex h-full flex-col justify-end">
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Paket</p>
              <p className="text-lg font-semibold text-neutral-100">Kurumsal</p>
            </div>
          </GlowCard>
        </div>
      </Stage>

      <Stage name="Material Design 3 Switch" file="material-design-3-switch.tsx">
        <div className="flex flex-wrap items-center justify-center gap-10">
          <div className="flex flex-col items-center gap-3">
            <div className="scale-[1.4]">
              <Switch defaultChecked />
            </div>
            <span className="text-xs text-neutral-500">Standart</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="scale-[1.4]">
              <Switch defaultChecked showIcons />
            </div>
            <span className="text-xs text-neutral-500">İkonlu</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="scale-[1.4]">
              <Switch
                defaultChecked
                haptic="light"
                checkedIcon={<Moon className="h-3.5 w-3.5 fill-current" />}
                uncheckedIcon={<Sun className="h-3.5 w-3.5 fill-current" />}
              />
            </div>
            <span className="text-xs text-neutral-500">Özel ikon</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="scale-[1.4]">
              <Switch
                variant="destructive"
                showIcons
                checkedIcon={<Lock className="h-3 w-3" />}
                uncheckedIcon={<Unlock className="h-3 w-3" />}
              />
            </div>
            <span className="text-xs text-neutral-500">Tehlikeli</span>
          </div>
        </div>
      </Stage>

      <Stage name="Liquid Metal Button" file="liquid-metal-button.tsx">
        <div className="flex items-center gap-8">
          <LiquidMetalButton label="Başlayalım" />
          <LiquidMetalButton viewMode="icon" />
        </div>
      </Stage>

      <Stage name="Card Fan Carousel" file="card-fan-carousel.tsx" bleed>
        <div className="w-full">
          <SocialCards cards={FAN_CARDS} />
        </div>
      </Stage>

      <Stage name="Animated Glowing Search Bar" file="animated-glowing-search-bar.tsx">
        <SearchComponent />
      </Stage>
    </div>
  );
}
