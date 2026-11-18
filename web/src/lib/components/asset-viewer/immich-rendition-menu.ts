import { MediaRenditionMenu } from 'media-chrome/menu/media-rendition-menu';

type Rendition = Parameters<MediaRenditionMenu['formatRendition']>[0];
type FormatOptions = Parameters<MediaRenditionMenu['formatRendition']>[1];

const LABEL_ATTRIBUTES = new Set(['original-rendition', 'original-label']);

class ImmichRenditionMenu extends MediaRenditionMenu {
  static override get observedAttributes(): string[] {
    return [...MediaRenditionMenu.observedAttributes, ...LABEL_ATTRIBUTES];
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (LABEL_ATTRIBUTES.has(name) && oldValue !== newValue) {
      const renditions = this.mediaRenditionList;
      this.mediaRenditionList = [];
      this.mediaRenditionList = renditions;
    }
  }

  override formatRendition(rendition: Rendition, options?: FormatOptions): string {
    if (rendition.id === this.getAttribute('original-rendition')) {
      return this.getAttribute('original-label') ?? 'Original';
    }
    return super.formatRendition(rendition, options);
  }
}

if (!customElements.get('immich-rendition-menu')) {
  customElements.define('immich-rendition-menu', ImmichRenditionMenu);
}
