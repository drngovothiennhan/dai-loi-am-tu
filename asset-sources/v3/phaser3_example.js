// Phaser 3 — TexturePacker JSON Hash atlas
export function preload() { this.load.atlas('dlt','assets/dai_loi_am_tu/atlas.png','assets/dai_loi_am_tu/atlas.json'); }
export function create() {
 const cfg={idle:{frames:[0,1,2,3],fps:4,repeat:-1},walk_preview:{frames:[0,1,2,3,4,5,6],fps:8,repeat:-1},sit:{frames:[7,8,9,10,11,12,13],fps:5,repeat:-1},kneel:{frames:[11,12,13,14,15],fps:6,repeat:-1},bow:{frames:[14,15,16],fps:6,repeat:0}};
 for(const c of ['chu_tieu','phat_tu']) for(const [n,a] of Object.entries(cfg)) this.anims.create({key:`${c}:${n}`,frames:a.frames.map(i=>({key:'dlt',frame:`${c}_${String(i).padStart(2,'0')}`})),frameRate:a.fps,repeat:a.repeat});
 this.add.sprite(240,420,'dlt','chu_tieu_00').setOrigin(.5,1).play('chu_tieu:idle');
}
