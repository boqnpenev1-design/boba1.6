const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Custom CRC32 implementation for zero-dependency PNG export
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}
const crcTable = makeCrcTable();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function writePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = Buffer.alloc(25);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrChunk.write('IHDR', 4);
  ihdrChunk.writeUInt32BE(width, 8);
  ihdrChunk.writeUInt32BE(height, 12);
  ihdrChunk.writeUInt8(8, 16);
  ihdrChunk.writeUInt8(6, 17);
  ihdrChunk.writeUInt8(0, 18);
  ihdrChunk.writeUInt8(0, 19);
  ihdrChunk.writeUInt8(0, 20);
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.subarray(4, 21)), 21);

  const rawScanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rawScanlines[y * (width * 4 + 1)] = 0;
    rgbaBuffer.copy(rawScanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressedData = zlib.deflateSync(rawScanlines);
  const idatChunk = Buffer.alloc(compressedData.length + 12);
  idatChunk.writeUInt32BE(compressedData.length, 0);
  idatChunk.write('IDAT', 4);
  compressedData.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(crc32(idatChunk.subarray(4, idatChunk.length - 4)), idatChunk.length - 4);

  const iendChunk = Buffer.alloc(12);
  iendChunk.writeUInt32BE(0, 0);
  iendChunk.write('IEND', 4);
  iendChunk.writeUInt32BE(crc32(Buffer.from('IEND')), 8);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function angleQuaternion(angles) {
  const angleZ = angles[2] * 0.5, sy = Math.sin(angleZ), cy = Math.cos(angleZ);
  const angleY = angles[1] * 0.5, sp = Math.sin(angleY), cp = Math.cos(angleY);
  const angleX = angles[0] * 0.5, sr = Math.sin(angleX), cr = Math.cos(angleX);
  return [
    sr*cp*cy - cr*sp*sy,
    cr*sp*cy + sr*cp*sy,
    cr*cp*sy - sr*sp*cy,
    cr*cp*cy + sr*sp*sy
  ];
}

function quaternionMatrix(quat, pos) {
  const [x, y, z, w] = quat;
  return [
    [1.0 - 2.0*y*y - 2.0*z*z, 2.0*x*y - 2.0*w*z, 2.0*x*z + 2.0*w*y, pos[0]],
    [2.0*x*y + 2.0*w*z, 1.0 - 2.0*x*x - 2.0*z*z, 2.0*y*z - 2.0*w*x, pos[1]],
    [2.0*x*z - 2.0*w*y, 2.0*y*z + 2.0*w*x, 1.0 - 2.0*x*x - 2.0*y*y, pos[2]]
  ];
}

function concatTransforms(m1, m2) {
  const r = [[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i][j] = m1[i][0]*m2[0][j] + m1[i][1]*m2[1][j] + m1[i][2]*m2[2][j];
    }
    r[i][3] = m1[i][0]*m2[0][3] + m1[i][1]*m2[1][3] + m1[i][2]*m2[2][3] + m1[i][3];
  }
  return r;
}

function parseMdl(filePath, outputModelId, isPlayerModel = false) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return null;
  }
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'IDST') {
    console.warn(`Not an IDST model: ${filePath}`);
    return null;
  }

  // 1. Textures
  const numtextures = buf.readInt32LE(180);
  const textureindex = buf.readInt32LE(184);
  const textures = [];

  const texDir = path.join('textures', 'cs16', outputModelId);
  fs.mkdirSync(texDir, { recursive: true });

  for (let i = 0; i < numtextures; i++) {
    const off = textureindex + i * 80;
    const name = buf.toString('ascii', off, off + 64).replace(/\0.*$/g, '');
    const cleanName = path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9_]/g, '_') + '.png';
    const width = buf.readInt32LE(off + 68);
    const height = buf.readInt32LE(off + 72);
    const dataOffset = buf.readInt32LE(off + 76);

    const palOffset = dataOffset + width * height;
    const rgba = Buffer.alloc(width * height * 4);
    let outPtr = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const palIdx = buf.readUInt8(dataOffset + y * width + x);
        rgba[outPtr++] = buf.readUInt8(palOffset + palIdx * 3);
        rgba[outPtr++] = buf.readUInt8(palOffset + palIdx * 3 + 1);
        rgba[outPtr++] = buf.readUInt8(palOffset + palIdx * 3 + 2);
        rgba[outPtr++] = 255;
      }
    }

    const png = writePng(width, height, rgba);
    const outPngPath = path.join(texDir, cleanName);
    fs.writeFileSync(outPngPath, png);
    textures.push({
      id: i,
      name: cleanName,
      path: `textures/cs16/${outputModelId}/${cleanName}`,
      width,
      height
    });
  }

  // 2. Bones
  const numbones = buf.readInt32LE(140);
  const boneindex = buf.readInt32LE(144);
  const bones = [];
  for (let b = 0; b < numbones; b++) {
    const off = boneindex + b * 112;
    const scales = [];
    for (let s = 0; s < 6; s++) {
      scales.push(buf.readFloatLE(off + 88 + s * 4));
    }
    bones.push({
      parent: buf.readInt32LE(off + 32),
      pos: [buf.readFloatLE(off + 64), buf.readFloatLE(off + 68), buf.readFloatLE(off + 72)],
      rot: [buf.readFloatLE(off + 76), buf.readFloatLE(off + 80), buf.readFloatLE(off + 84)],
      scales
    });
  }

  // Check sequence 0 (idle animation frame 0) for authentic gameplay holding pose (essential for knife)
  const numseq = buf.readInt32LE(164);
  const seqindex = buf.readInt32LE(168);
  let animindex = 0;
  if (isPlayerModel && numseq > 1 && seqindex > 0 && (seqindex + 176 + 128) < buf.length) {
    // Seq 1 is idle1 for player models (arms down, authentic standing combat stance holding gun)
    animindex = buf.readInt32LE(seqindex + 176 + 124);
  } else if (!isPlayerModel && numseq > 0 && seqindex > 0 && (seqindex + 128) < buf.length) {
    animindex = buf.readInt32LE(seqindex + 124);
  }

  const boneMatrices = [];
  for (let b = 0; b < numbones; b++) {
    const pos = [bones[b].pos[0], bones[b].pos[1], bones[b].pos[2]];
    const rot = [bones[b].rot[0], bones[b].rot[1], bones[b].rot[2]];
    if (animindex > 0 && animindex < buf.length) {
      const bOff = animindex + b * 12;
      for (let c = 0; c < 6; c++) {
        const offset = buf.readUInt16LE(bOff + c * 2);
        if (offset > 0 && (bOff + offset + 2) < buf.length) {
          const val = buf.readInt16LE(bOff + offset + 2);
          if (c < 3) pos[c] += val * bones[b].scales[c];
          else rot[c - 3] += val * bones[b].scales[c];
        }
      }
    }
    const q = angleQuaternion(rot);
    const local = quaternionMatrix(q, pos);
    boneMatrices.push(bones[b].parent === -1 ? local : concatTransforms(boneMatrices[bones[b].parent], local));
  }

  // 3. Bodyparts and Meshes
  const numbodyparts = buf.readInt32LE(204);
  const bodypartindex = buf.readInt32LE(208);

  // First pass: find min_ty for canonical viewmodel positioning and min_tz for player feet positioning
  let min_ty = 99999;
  let max_ty = -99999;
  let min_tz = 99999;
  let bestWeaponY = -99999;
  let bestWeaponVert = null;

  for (let bp = 0; bp < numbodyparts; bp++) {
    const bpOff = bodypartindex + bp * 76;
    const bpName = buf.toString('ascii', bpOff, bpOff + 64).replace(/\0.*$/g, '');
    const nummodels = buf.readInt32LE(bpOff + 64);
    const modelindex = buf.readInt32LE(bpOff + 72);

    for (let m = 0; m < nummodels; m++) {
      const mOff = modelindex + m * 112;
      const numverts = buf.readInt32LE(mOff + 80);
      const vertinfoindex = buf.readInt32LE(mOff + 84);
      const vertindex = buf.readInt32LE(mOff + 88);

      for (let v = 0; v < numverts; v++) {
        const b = buf.readUInt8(vertinfoindex + v);
        const vx = buf.readFloatLE(vertindex + v * 12);
        const vy = buf.readFloatLE(vertindex + v * 12 + 4);
        const vz = buf.readFloatLE(vertindex + v * 12 + 8);
        const mat = boneMatrices[b];
        const tx = vx*mat[0][0] + vy*mat[0][1] + vz*mat[0][2] + mat[0][3];
        const ty = vx*mat[1][0] + vy*mat[1][1] + vz*mat[1][2] + mat[1][3];
        const tz = vx*mat[2][0] + vy*mat[2][1] + vz*mat[2][2] + mat[2][3];

        if (ty < min_ty) min_ty = ty;
        if (ty > max_ty) max_ty = ty;
        if (tz < min_tz) min_tz = tz;

        if (bpName !== 'rhand' && bpName !== 'lhand') {
          if (ty > bestWeaponY) {
            bestWeaponY = ty;
            bestWeaponVert = [tx, ty, tz];
          }
        }
      }
    }
  }

  // Second pass: extract transformed triangles
  const meshGroups = {};

  for (let bp = 0; bp < numbodyparts; bp++) {
    const bpOff = bodypartindex + bp * 76;
    const nummodels = buf.readInt32LE(bpOff + 64);
    const modelindex = buf.readInt32LE(bpOff + 72);

    for (let m = 0; m < nummodels; m++) {
      const mOff = modelindex + m * 112;
      const numverts = buf.readInt32LE(mOff + 80);
      const vertinfoindex = buf.readInt32LE(mOff + 84);
      const vertindex = buf.readInt32LE(mOff + 88);
      const numnorms = buf.readInt32LE(mOff + 92);
      const norminfoindex = buf.readInt32LE(mOff + 96);
      const normindex = buf.readInt32LE(mOff + 100);
      const nummesh = buf.readInt32LE(mOff + 72);
      const meshindex = buf.readInt32LE(mOff + 76);

      const transformedVerts = [];
      const transformedNorms = [];

      for (let v = 0; v < numverts; v++) {
        const b = buf.readUInt8(vertinfoindex + v);
        const vx = buf.readFloatLE(vertindex + v * 12);
        const vy = buf.readFloatLE(vertindex + v * 12 + 4);
        const vz = buf.readFloatLE(vertindex + v * 12 + 8);
        const mat = boneMatrices[b];
        const tx = vx*mat[0][0] + vy*mat[0][1] + vz*mat[0][2] + mat[0][3];
        const ty = vx*mat[1][0] + vy*mat[1][1] + vz*mat[1][2] + mat[1][3];
        const tz = vx*mat[2][0] + vy*mat[2][1] + vz*mat[2][2] + mat[2][3];

        if (isPlayerModel) {
          // Player model: feet normalized to floor (Y=0.00), standing upright facing forward (-Z in Three.js)
          // Scale 0.045 exactly matches Dust 2 map scale (72 units * 0.045 = 3.24m height, taller than standard 2.88m crates)
          const py = (tz - min_tz) * 0.045;
          const px = -ty * 0.045;
          const pz = -tx * 0.045;
          transformedVerts.push([px, py, pz]);
        } else {
          // Viewmodel: pointing downrange (-Z), hands situated canonically in lower-right quadrant (+0.52 offset)
          const x3 = (-tx * 0.025) + 0.52;
          const y3 = (tz * 0.025) - 0.22;
          const z3 = -((ty - min_ty) * 0.025) - 0.16;
          transformedVerts.push([x3, y3, z3]);
        }
      }

      for (let n = 0; n < numnorms; n++) {
        const b = buf.readUInt8(norminfoindex + n);
        const nx = buf.readFloatLE(normindex + n * 12);
        const ny = buf.readFloatLE(normindex + n * 12 + 4);
        const nz = buf.readFloatLE(normindex + n * 12 + 8);
        const mat = boneMatrices[b];
        const tnx = nx*mat[0][0] + ny*mat[0][1] + nz*mat[0][2];
        const tny = nx*mat[1][0] + ny*mat[1][1] + nz*mat[1][2];
        const tnz = nx*mat[2][0] + ny*mat[2][1] + nz*mat[2][2];
        if (isPlayerModel) {
          transformedNorms.push([-tny, tnz, -tnx]);
        } else {
          transformedNorms.push([-tnx, tnz, -tny]);
        }
      }

      for (let mi = 0; mi < nummesh; mi++) {
        const meshOff = meshindex + mi * 20;
        const triindex = buf.readInt32LE(meshOff + 4);
        const skinref = buf.readInt32LE(meshOff + 8);
        const tex = textures[skinref] || textures[0];

        if (!meshGroups[skinref]) {
          meshGroups[skinref] = {
            textureId: skinref,
            texturePath: tex.path,
            positions: [],
            normals: [],
            uvs: []
          };
        }
        const grp = meshGroups[skinref];

        let ptr = triindex;
        while (ptr < buf.length) {
          const count = buf.readInt16LE(ptr);
          ptr += 2;
          if (count === 0) break;
          const isStrip = count > 0;
          const numV = Math.abs(count);
          const triVerts = [];
          for (let vi = 0; vi < numV; vi++) {
            const vIdx = buf.readInt16LE(ptr + vi * 8);
            const nIdx = buf.readInt16LE(ptr + vi * 8 + 2);
            const s = buf.readInt16LE(ptr + vi * 8 + 4);
            const t = buf.readInt16LE(ptr + vi * 8 + 6);
            triVerts.push({
              pos: transformedVerts[vIdx],
              norm: transformedNorms[nIdx] || [0, 1, 0],
              u: s / tex.width,
              v: 1.0 - (t / tex.height)
            });
          }

          function addTri(v1, v2, v3) {
            grp.positions.push(...v1.pos, ...v2.pos, ...v3.pos);
            grp.normals.push(...v1.norm, ...v2.norm, ...v3.norm);
            grp.uvs.push(v1.u, v1.v, v2.u, v2.v, v3.u, v3.v);
          }

          if (isStrip) {
            for (let t = 0; t < numV - 2; t++) {
              if (t % 2 === 0) {
                addTri(triVerts[t], triVerts[t+1], triVerts[t+2]);
              } else {
                addTri(triVerts[t+1], triVerts[t], triVerts[t+2]);
              }
            }
          } else {
            for (let t = 1; t < numV - 1; t++) {
              addTri(triVerts[0], triVerts[t], triVerts[t+1]);
            }
          }
          ptr += numV * 8;
        }
      }
    }
  }

  let barrelTip = [0.35, -0.10, -0.85];
  if (bestWeaponVert) {
    const [bx, by, bz] = bestWeaponVert;
    barrelTip = [
      (-bx * 0.025) + 0.52,
      (bz * 0.025) - 0.22,
      -((by - min_ty) * 0.025) - 0.18
    ];
  }

  const meshes = Object.values(meshGroups).map(g => ({
    texture: g.texturePath,
    positions: g.positions,
    normals: g.normals,
    uvs: g.uvs
  }));

  const outData = {
    id: outputModelId,
    type: isPlayerModel ? 'player' : 'viewmodel',
    meshes,
    barrelTip
  };

  const outModelsDir = path.join('models', 'cs16');
  fs.mkdirSync(outModelsDir, { recursive: true });
  const outJsonPath = path.join(outModelsDir, `${outputModelId}.json`);
  fs.writeFileSync(outJsonPath, JSON.stringify(outData));
  
  const totalTris = meshes.reduce((acc, m) => acc + m.positions.length / 9, 0);
  console.log(`Exported ${outputModelId}: ${meshes.length} submeshes, ${totalTris} tris, barrelTip: [${barrelTip.map(n=>n.toFixed(3)).join(', ')}] -> ${outJsonPath}`);
  return outData;
}

// Convert all viewmodels
const viewmodelMap = {
  'knife': 'cstrike/models/v_knife.mdl',
  'ak47': 'cstrike/models/v_ak47.mdl',
  'm4a1': 'cstrike/models/v_m4a1.mdl',
  'awp': 'cstrike/models/v_awp.mdl',
  'scout': 'cstrike/models/v_scout.mdl',
  'deagle': 'cstrike/models/v_deagle.mdl',
  'usp': 'cstrike/models/v_usp.mdl',
  'glock': 'cstrike/models/v_glock18.mdl',
  'p228': 'cstrike/models/v_p228.mdl',
  'fiveseven': 'cstrike_hd/models/v_fiveseven.mdl',
  'elite': 'cstrike/models/v_elite.mdl',
  'p90': 'cstrike/models/v_p90.mdl',
  'ump45': 'cstrike/models/v_ump45.mdl',
  'mp5': 'cstrike/models/v_mp5.mdl',
  'mac10': 'cstrike/models/v_mac10.mdl',
  'galil': 'cstrike/models/v_galil.mdl',
  'famas': 'cstrike/models/v_famas.mdl',
  'aug': 'cstrike/models/v_aug.mdl',
  'sg552': 'cstrike/models/v_sg552.mdl',
  'g3sg1': 'cstrike/models/v_g3sg1.mdl',
  'm3': 'cstrike/models/v_m3.mdl',
  'xm1014': 'cstrike/models/v_xm1014.mdl',
  'm249': 'cstrike/models/v_m249.mdl',
  'c4': 'cstrike/models/v_c4.mdl',
  'flashbang': 'cstrike/models/v_flashbang.mdl',
  'hegrenade': 'cstrike/models/v_hegrenade.mdl',
  'smokegrenade': 'cstrike/models/v_smokegrenade.mdl'
};

console.log('--- Converting Viewmodels ---');
for (const [id, mdlPath] of Object.entries(viewmodelMap)) {
  parseMdl(mdlPath, id, false);
}

// Convert player models
const playerMap = {
  'terror': 'cstrike/models/player/terror/terror.mdl',
  'sas': 'cstrike/models/player/sas/sas.mdl',
  'leet': 'cstrike/models/player/leet/leet.mdl',
  'urban': 'cstrike/models/player/urban/urban.mdl'
};

console.log('--- Converting Player Models ---');
for (const [id, mdlPath] of Object.entries(playerMap)) {
  parseMdl(mdlPath, id, true);
}

console.log('=== All CS 1.6 Assets Converted Successfully! ===');
