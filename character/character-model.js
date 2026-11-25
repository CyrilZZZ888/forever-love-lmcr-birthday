// Editable stylized 3D interpretation of references/girl-turnaround-v3-white-shoes.png.
// Units: x = left/right, y = height, z = front (+Z). Sizes are radii for spheres.
// The three-view illustration is a visual reference, not a reconstructed scan.
window.CHARACTER_MODEL = {
  palette: {
    skin: '#f5cdb9', skinShade: '#e5b59f', blush: '#dc9b98',
    sclera: '#fff6ef', iris: '#63463d', pupil: '#201b20', glint: '#ffffff',
    lips: '#b9555d', nose: '#d99f91',
    hair: '#211b21', hairLight: '#403238', hairSheen: '#655158',
    robe: '#234552', robeLight: '#396574', robeDark: '#172f3a',
    collar: '#bac3a6', collarShade: '#919d82', cuff: '#d0d4b6',
    gold: '#d9b766', rabbit: '#f3efe5', rabbitShade: '#d9d3c8',
    rabbitPink: '#dca9ac', rabbitEye: '#29252b',
    shoe: '#f8f7f3', shoeSole: '#d9d7d0', shoeSeam: '#e9e4db'
  },
  motion: { legSwing: 0.3, walkBob: 0.025, dressSway: 0.03 },
  skirt: {
    // A pleated bell silhouette. The hem is deliberately close to the shoes.
    rings: [
      [1.55, 0.31], [1.38, 0.34], [1.12, 0.42],
      [0.83, 0.53], [0.48, 0.68], [0.16, 0.81], [0.13, 0.82]
    ],
    pleats: 12,
    pleatDepth: 0.035
  },
  parts: {
    legs: {
      pivot: [0.17, 0.67, 0],
      pieces: [
        { shape: 'sphere', position: [0, -0.22, 0], size: [0.11, 0.43, 0.12], color: 'skinShade' },
        { shape: 'sphere', position: [0, -0.56, 0.52], size: [0.15, 0.08, 0.23], color: 'shoeSole' },
        { shape: 'sphere', position: [0, -0.51, 0.53], size: [0.145, 0.095, 0.22], color: 'shoe' },
        { shape: 'sphere', position: [0, -0.47, 0.66], size: [0.115, 0.028, 0.058], color: 'shoeSeam' }
      ]
    },
    body: [
      { shape: 'sphere', position: [0, 1.73, 0], size: [0.33, 0.43, 0.24], color: 'robe', pattern: true },
      { shape: 'sphere', position: [0, 1.46, 0.01], size: [0.32, 0.105, 0.27], color: 'robeDark' },
      { shape: 'sphere', position: [0, 2.06, 0.11], size: [0.16, 0.13, 0.11], color: 'skin' },
      { shape: 'box', position: [-0.16, 1.91, 0.252], size: [0.135, 0.5, 0.055], rotation: [0, 0, 0.47], color: 'collar' },
      { shape: 'box', position: [0.16, 1.91, 0.257], size: [0.135, 0.5, 0.055], rotation: [0, 0, -0.47], color: 'cuff' },
      { shape: 'sphere', position: [0, 1.42, 0], size: [0.37, 0.075, 0.28], color: 'collarShade' },
      { shape: 'sphere', position: [0, 2.012, 0.266], size: [0.036, 0.042, 0.018], color: 'gold' }
    ],
    head: [
      { shape: 'sphere', position: [0, 2.21, -0.02], size: [0.11, 0.17, 0.11], color: 'skin' },
      { shape: 'sphere', position: [0, 2.43, -0.075], size: [0.34, 0.4, 0.29], color: 'hair' },
      { shape: 'sphere', position: [0, 2.42, 0.085], size: [0.285, 0.34, 0.245], color: 'skin' },
      { shape: 'sphere', position: [-0.278, 2.4, 0.077], size: [0.06, 0.105, 0.05], color: 'skinShade' },
      { shape: 'sphere', position: [0.278, 2.4, 0.077], size: [0.06, 0.105, 0.05], color: 'skinShade' },
      { shape: 'sphere', position: [-0.155, 2.35, 0.286], size: [0.065, 0.03, 0.012], color: 'blush' },
      { shape: 'sphere', position: [0.155, 2.35, 0.286], size: [0.065, 0.03, 0.012], color: 'blush' },
      { shape: 'sphere', position: [-0.108, 2.46, 0.301], size: [0.072, 0.053, 0.025], color: 'sclera' },
      { shape: 'sphere', position: [0.108, 2.46, 0.301], size: [0.072, 0.053, 0.025], color: 'sclera' },
      { shape: 'sphere', position: [-0.108, 2.46, 0.323], size: [0.04, 0.047, 0.019], color: 'iris' },
      { shape: 'sphere', position: [0.108, 2.46, 0.323], size: [0.04, 0.047, 0.019], color: 'iris' },
      { shape: 'sphere', position: [-0.108, 2.46, 0.339], size: [0.023, 0.037, 0.012], color: 'pupil' },
      { shape: 'sphere', position: [0.108, 2.46, 0.339], size: [0.023, 0.037, 0.012], color: 'pupil' },
      { shape: 'sphere', position: [-0.119, 2.48, 0.349], size: [0.011, 0.012, 0.007], color: 'glint' },
      { shape: 'sphere', position: [0.097, 2.48, 0.349], size: [0.011, 0.012, 0.007], color: 'glint' },
      { shape: 'sphere', position: [-0.111, 2.536, 0.287], size: [0.076, 0.015, 0.02], color: 'hair' },
      { shape: 'sphere', position: [0.111, 2.536, 0.287], size: [0.076, 0.015, 0.02], color: 'hair' },
      { shape: 'sphere', position: [0, 2.369, 0.337], size: [0.027, 0.035, 0.026], color: 'nose' },
      { shape: 'sphere', position: [0, 2.291, 0.305], size: [0.073, 0.025, 0.021], color: 'lips' },
      { shape: 'sphere', position: [0, 2.305, 0.316], size: [0.055, 0.011, 0.009], color: 'blush' },
      { shape: 'sphere', position: [0, 2.72, -0.035], size: [0.32, 0.13, 0.27], color: 'hair' }
    ],
    rabbit: [
      { shape: 'sphere', position: [0, 1.54, 0.51], size: [0.18, 0.22, 0.14], color: 'rabbitShade' },
      { shape: 'sphere', position: [0, 1.57, 0.58], size: [0.19, 0.23, 0.16], color: 'rabbit' },
      { shape: 'sphere', position: [0, 1.81, 0.66], size: [0.18, 0.16, 0.14], color: 'rabbit' },
      { shape: 'sphere', position: [-0.12, 1.37, 0.64], size: [0.09, 0.07, 0.07], color: 'rabbit' },
      { shape: 'sphere', position: [0.12, 1.37, 0.64], size: [0.09, 0.07, 0.07], color: 'rabbit' },
      { shape: 'sphere', position: [-0.115, 1.68, 0.76], size: [0.072, 0.062, 0.06], color: 'rabbit' },
      { shape: 'sphere', position: [0.115, 1.68, 0.76], size: [0.072, 0.062, 0.06], color: 'rabbit' },
      { shape: 'sphere', position: [-0.065, 1.84, 0.794], size: [0.018, 0.022, 0.014], color: 'rabbitEye' },
      { shape: 'sphere', position: [0.065, 1.84, 0.794], size: [0.018, 0.022, 0.014], color: 'rabbitEye' },
      { shape: 'sphere', position: [0, 1.79, 0.795], size: [0.029, 0.021, 0.017], color: 'rabbitPink' }
    ]
  }
};
