/**
 * @file openai.ts
 * @description 处理 OpenAI 标准的生图、生视频路由接口。包含复杂的视频流和多媒体帧校验逻辑，以及 ffmpeg 探测。
 * @author XiaoYue <43854695@qq.com>
 * @license MIT
 * @date 2026-04-17
 *
 * [! 防屎山规范 !]
 * - 绝对不要在此文件写死任何 API KEY 或硬编码文件路径！
 * - 所有的多媒体时长、帧率校验规则集中在此文件的顶部常量中管理。
 * - 使用 ffprobe 进行实际的多媒体探测，不依赖文件后缀做武断判断。
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=openai.d.ts.map