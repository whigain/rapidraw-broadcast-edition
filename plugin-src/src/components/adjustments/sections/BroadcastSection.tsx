import { useTranslation } from 'react-i18next';
import Slider, { SliderChangeEvent } from '../../ui/Slider';
import Switch from '../../ui/Switch';
import Dropdown from '../../ui/Dropdown';
import AdjustmentSubSection from '../AdjustmentSubSection';
import { SpatialEffect } from '../Effects';
import { Adjustments } from '../../../utils/adjustments';
import {
  BROADCAST_PRESETS,
  BroadcastPreset,
  BroadcastSdLook,
  rollBroadcastSeed,
} from '../../../utils/broadcast';

interface BroadcastSectionProps {
  adjustments: Adjustments;
  hiddenTools: string[];
  onDragStateChange?: (isDragging: boolean) => void;
  setAdjustments(updater: (prev: Adjustments) => Adjustments): void;
  toolOrder: string[];
}

// Early 2000s Television Broadcast — one toggled "look" section inside the
// Effects panel. Every control is written through the raw setAdjustments setter
// (string fields need it, and editing any value flips the preset to "custom").
export default function BroadcastSection({
  adjustments,
  hiddenTools,
  onDragStateChange,
  setAdjustments,
  toolOrder,
}: BroadcastSectionProps) {
  const { t } = useTranslation();
  // RapidRAW's `t` is overloaded so a dynamic (non-literal) key needs the
  // options form; this typed alias keeps the slider helper tidy.
  const tr = t as unknown as (key: string) => string;

  if (hiddenTools.includes('broadcast')) {
    return null;
  }

  // Edit a field and mark the preset custom (so the dropdown stops lying).
  const setField = (key: keyof Adjustments, value: number | boolean | string) =>
    setAdjustments((prev) => ({ ...prev, [key]: value, broadcastPreset: 'custom' }));

  const applyPreset = (presetId: BroadcastPreset) => {
    const preset = BROADCAST_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setAdjustments((prev) => ({ ...prev, ...preset.values }));
  };

  const rerollSeed = () => {
    setAdjustments((prev) => ({ ...prev, broadcastSeed: rollBroadcastSeed() }));
  };

  const presetOptions = [
    { label: t('editor.broadcast.presets.dvw790'), value: 'dvw790' as BroadcastPreset },
    { label: t('editor.broadcast.presets.studio'), value: 'studio' as BroadcastPreset },
    { label: t('editor.broadcast.presets.eng'), value: 'eng' as BroadcastPreset },
    { label: t('editor.broadcast.presets.custom'), value: 'custom' as BroadcastPreset },
  ];

  const sdOptions = [
    { label: t('editor.broadcast.sd.off'), value: 'off' as BroadcastSdLook },
    { label: t('editor.broadcast.sd.pal576'), value: 'pal576' as BroadcastSdLook },
    { label: t('editor.broadcast.sd.soft576'), value: 'soft576' as BroadcastSdLook },
  ];

  const slider = (key: keyof Adjustments, labelKey: string, defaultValue: number) => (
    <Slider
      defaultValue={defaultValue}
      label={tr(labelKey)}
      max={100}
      min={0}
      onChange={(e: SliderChangeEvent) => setField(key, e.target.value)}
      onDragStateChange={onDragStateChange}
      step={1}
      suffix=" %"
      value={adjustments[key] as number}
    />
  );

  return (
    <AdjustmentSubSection
      id="broadcast"
      order={toolOrder.indexOf('broadcast')}
      title={t('editor.broadcast.title')}
      actions={
        <button
          className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded-md hover:bg-card-active"
          onClick={rerollSeed}
          title={t('editor.broadcast.rerollSeedTitle')}
          type="button"
        >
          {t('editor.broadcast.rerollSeed')}
        </button>
      }
    >
      <SpatialEffect
        enabled={adjustments.broadcastEnabled}
        label={t('editor.broadcast.enable')}
        onToggle={(enabled: boolean) =>
          setAdjustments((prev) => ({ ...prev, broadcastEnabled: enabled }))
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-text-secondary">{t('editor.broadcast.preset')}</span>
          <Dropdown
            className="w-36"
            onChange={(value: BroadcastPreset) => applyPreset(value)}
            options={presetOptions}
            value={adjustments.broadcastPreset}
          />
        </div>

        {slider('broadcastAmount', 'editor.broadcast.amount', 100)}
        {slider('broadcastSoftness', 'editor.broadcast.softness', 35)}
        {slider('broadcastDetail', 'editor.broadcast.detail', 45)}
        {slider('broadcastChromaReduction', 'editor.broadcast.chromaReduction', 50)}
        {slider('broadcastColorPunch', 'editor.broadcast.colorPunch', 40)}
        {slider('broadcastHighlightRolloff', 'editor.broadcast.highlightRolloff', 50)}
        {slider('broadcastDiffusion', 'editor.broadcast.diffusion', 30)}
        {slider('broadcastDiffusionThreshold', 'editor.broadcast.diffusionThreshold', 70)}
        {slider('broadcastSkinSmooth', 'editor.broadcast.skinSmooth', 45)}
        {slider('broadcastWarmth', 'editor.broadcast.warmth', 45)}
        {slider('broadcastVideoNoise', 'editor.broadcast.videoNoise', 0)}

        <Switch
          checked={adjustments.broadcastInterlace}
          label={t('editor.broadcast.interlace')}
          onChange={(checked: boolean) => setField('broadcastInterlace', checked)}
        />
        {adjustments.broadcastInterlace &&
          slider('broadcastInterlaceStrength', 'editor.broadcast.interlaceStrength', 20)}

        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-sm text-text-secondary">{t('editor.broadcast.sdLook')}</span>
          <Dropdown
            className="w-36"
            onChange={(value: BroadcastSdLook) => setField('broadcastSdLook', value)}
            options={sdOptions}
            value={adjustments.broadcastSdLook}
          />
        </div>
      </SpatialEffect>
    </AdjustmentSubSection>
  );
}
