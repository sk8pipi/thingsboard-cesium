import { defHttp } from '/@/utils/http/axios';

/**
 * ThingsBoard 常见接口（swagger/demo 上能看到）
 * - GET /api/widgetsBundles?pageSize=&page=&sortProperty=&sortOrder=&textSearch=
 * - GET /api/widgetTypes?isSystem=&bundleAlias=&textSearch=
 *
 * 说明：
 * - widgetsBundles 是“分类/部件包”
 * - widgetTypes 是“某个分类下的部件列表”
 */

// TB 的 PageData 结构（大多数分页接口都长这样）
export interface TbPageData<T> {
  data: T[];
  totalPages?: number;
  totalElements?: number;
  hasNext?: boolean;
}

// Widgets Bundle（分类）
export interface TbWidgetsBundle {
  id: { id: string };
  title: string;
  alias: string; // 比如 cards / charts / maps ...
  image?: string; // 有的版本会带
  description?: string;
  tenantId?: { id: string } | null; // 系统 bundle 可能没有 tenantId
}

// Widget Type（部件条目）
export interface TbWidgetType {
  id: { id: string };
  alias: string;
  name: string;
  bundleAlias: string;

  // 不同版本字段可能不完全一致
  description?: string;
  image?: string;

  // type 常见：timeseries / latest / alarm / control / static
  //（TB UI 里会显示在列表的 “Type” 列）
  type?: string;

  // 有的版本会带 widgetSize/descriptor 等，这里先不强依赖
  descriptor?: any;
}

export async function getWidgetsBundlesPage(params: {
  pageSize?: number;
  page?: number;
  sortProperty?: string;
  sortOrder?: 'ASC' | 'DESC';
  textSearch?: string;
}) {
  return defHttp.get<TbPageData<TbWidgetsBundle>>({
    url: '/api/widgetsBundles',
    params: {
      pageSize: 50,
      page: 0,
      sortProperty: 'createdTime',
      sortOrder: 'DESC',
      ...params,
    },
  });
}

/**
 * 拉全部 bundles（自动翻页）
 */
export async function getAllWidgetsBundles(textSearch = '') {
  const pageSize = 50;
  let page = 0;
  const out: TbWidgetsBundle[] = [];

  while (true) {
    const res = await getWidgetsBundlesPage({ pageSize, page, textSearch });
    out.push(...(res?.data || []));
    if (!res?.hasNext) break;
    page += 1;
    if (page > 50) break; // 防御：避免后端异常死循环
  }

  return out;
}

/**
 * 拉某个 bundle 下的 widgetTypes
 * 关键参数：
 * - isSystem: true/false（系统部件库 / 租户自定义）
 * - bundleAlias: widgets bundle 的 alias
 */
export async function getWidgetTypes(params: {
  isSystem: boolean;

  bundleAlias: string;
  textSearch?: string;
}) {
  return defHttp.get<TbWidgetType[]>({
    url: '/api/widgetTypes',
    params,
  });
}
