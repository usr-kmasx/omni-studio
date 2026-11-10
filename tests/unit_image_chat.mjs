import assert from 'node:assert/strict';
import { imageGenerationPayload, textModelConversation } from '../js/api/image-generation.js';
import { conversationToMessages } from '../js/api/chat.js';
import { liveContext } from '../js/api/live-context.js';

assert.deepEqual(imageGenerationPayload({imageWidth:'1920',imageHeight:'1080',imageSteps:'35',imageSeed:'0',imageCfg:'0',imageSampler:'euler',imageNegative:' fog ',imageSigmas:'1,0',imagePrompt:'old draft'}), {
  width:1920,height:1080,steps:35,seed:0,cfg:0,sampler:'euler',negativePrompt:'fog',sigmas:'1,0',
});
assert.deepEqual(imageGenerationPayload({imageSeed:'',imageCfg:''}), {width:512,height:512,steps:20});
assert.throws(() => imageGenerationPayload({imageWidth:'0'}));
assert.throws(() => imageGenerationPayload({imageSteps:'1.5'}));
const input = [
  {role:'user',text:'describe a scene',media:[]},
  {role:'user',text:'paint this scene',media:[],imageTurn:true},
  {role:'assistant',text:'generated',media:[{kind:'image',base64:'AA'}],imageTurn:true},
  {role:'user',text:'tell me more',media:[]},
];
assert.equal(textModelConversation(input).length, 2);
assert.equal(conversationToMessages(input).length, 2);
assert.deepEqual(liveContext(input).map(x=>x.text), ['describe a scene','tell me more']);
console.log('Image chat settings and context isolation passed');
