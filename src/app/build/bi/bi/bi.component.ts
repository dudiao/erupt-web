import {Component, Inject, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {Bi, columnType, DimType, pageType} from "../model/bi.model";
import {NzMessageService, NzModalService} from "ng-zorro-antd";
import {STColumn, STPage} from "@delon/abc/table/table.interfaces";
import {BiDataService} from "../service/data.service";
import {ActivatedRoute} from "@angular/router";
import {Subscription} from "rxjs";
import {STComponent} from "@delon/abc";
import {ChartComponent} from "../chart/chart.component";
import {HandlerService} from "../service/handler.service";
import {SettingsService} from "@delon/theme";
import {isNotNull, isNull} from "@shared/util/erupt.util";
import {DrillComponent} from "../drill/drill.component";

@Component({
    selector: 'app-bi',
    templateUrl: './bi.component.html',
    styleUrls: ["./bi.component.less"],
    styles: []
})
export class BiComponent implements OnInit, OnDestroy {

    bi: Bi;

    name: string;

    haveNotNull: boolean = false;

    querying: boolean = false;

    clientWidth = document.body.clientWidth;

    hideCondition: boolean = false;

    @ViewChild("st", {static: false}) st: STComponent;

    @ViewChildren('biChart') biCharts: QueryList<ChartComponent>;

    pageType = pageType;

    sort: {
        column?: string,
        direction?: 'ascend' | 'descend' | null
    } = {
        direction: null
    };

    biTable: {

        data?: any,

        columns?: STColumn[],

        index: number;

        size: number;

        total: number;

        pageType?: pageType;

        page: STPage;

        pageSizeOptions?: number[];

    } = {
        index: 1,

        size: 10,

        total: 0,

        page: {
            show: false
        }

    };

    private router$: Subscription;

    timer: NodeJS.Timer;

    downloading: boolean = false;

    constructor(private dataService: BiDataService,
                public route: ActivatedRoute,
                private handlerService: HandlerService,
                public settingSrv: SettingsService,
                @Inject(NzMessageService) private msg: NzMessageService,
                @Inject(NzModalService) private modal: NzModalService
    ) {
    }

    ngOnInit() {
        this.router$ = this.route.params.subscribe(params => {
            this.timer && clearInterval(this.timer);
            this.name = params.name;
            this.biTable.columns = [];
            this.biTable.data = null;
            this.dataService.getBiBuild(this.name).subscribe(res => {
                this.bi = res;
                if (this.bi.pageType == pageType.front) {
                    this.biTable.page = {
                        show: true,
                        front: true,
                        placement: "center",
                        showSize: true,
                        showQuickJumper: true,
                    };
                }
                this.biTable.size = this.bi.pageSize;
                this.biTable.page.pageSizes = this.bi.pageSizeOptions;
                for (let dimension of res.dimensions) {
                    if (dimension.type === DimType.NUMBER_RANGE) {
                        dimension.$value = [];
                    }
                    if (isNotNull(dimension.defaultValue)) {
                        dimension.$value = dimension.defaultValue;
                    }
                    // console.log(dimension.$value, isNotNull(dimension.$value));
                    if (dimension.notNull && isNull(dimension.$value)) {
                        this.haveNotNull = true;
                        return;
                    }
                }
                this.query({
                    pageIndex: 1,
                    pageSize: this.biTable.size
                });
                if (this.bi.refreshTime) {
                    this.timer = setInterval(() => {
                        this.query({
                            pageIndex: this.biTable.index,
                            pageSize: this.biTable.size
                        }, true, false);
                    }, this.bi.refreshTime * 1000);
                }
            });
        });
    }

    query(page: {
        pageIndex: number,
        pageSize: number
    }, updateChart?: boolean, chartLoading: boolean = true) {
        let param = this.handlerService.buildDimParam(this.bi);
        if (!param) {
            return;
        }
        if (updateChart) {
            this.biCharts.forEach(chart => chart.update(chartLoading));
        }
        if (this.bi.table) {
            this.querying = true;
            this.biTable.index = page.pageIndex;
            this.dataService.getBiData(this.bi.code, page.pageIndex, page.pageSize, this.sort.column, this.sort.direction, param).subscribe(res => {
                this.querying = false;
                this.haveNotNull = false;
                this.biTable.total = res.total;
                this.biTable.pageType = this.bi.pageType;
                this.biTable.columns = [];
                if (!res.columns) {
                    this.biTable.data = [];
                } else {
                    for (let column of res.columns) {
                        if (column.display) {
                            let col: STColumn = {
                                title: column.name,
                                index: column.name,
                                width: column.width,
                                className: "text-center",
                                show: true,
                                iif: () => {
                                    return col.show;
                                }
                            };
                            if (column.sortable) {
                                col.sort = {
                                    key: column.name,
                                    default: (this.sort.column == column.name) ? this.sort.direction : null
                                };
                            }
                            if (column.type == columnType.STRING) {
                            } else if (column.type == columnType.NUMBER) {
                                col.type = "number";
                            } else if (column.type == columnType.DATE) {
                                col.type = "date";
                            } else if (column.type == columnType.DRILL) {
                                col.type = "link";
                                col.click = (row) => {
                                    this.modal.create({
                                        nzWrapClassName: "modal-lg",
                                        nzKeyboard: false,
                                        nzMaskClosable: false,
                                        nzStyle: {top: "30px"},
                                        nzTitle: column.name,
                                        nzContent: DrillComponent,
                                        nzComponentParams: {
                                            drillCode: column.code,
                                            bi: this.bi,
                                            row: row
                                        },
                                        nzFooter: null
                                    });
                                };
                            }
                            this.biTable.columns.push(col);
                        }
                    }
                    this.biTable.data = res.list;
                }
            });
        }
    }

    biTableChange(e) {
        if (e.type == 'sort') {
            this.sort = {
                column: e.sort.column.indexKey
            };
            if (e.sort.value) {
                this.sort.direction = e.sort.value;
            }
            this.query({
                pageIndex: 1,
                pageSize: this.biTable.size
            });
        }
    }

    pageIndexChange(index) {
        this.query({
            pageIndex: index,
            pageSize: this.biTable.size
        });
    }

    pageSizeChange(size) {
        this.biTable.size = size;
        this.query({
            pageIndex: 1,
            pageSize: size
        });
    }

    clearCondition() {
        for (let dimension of this.bi.dimensions) {
            dimension.$value = null;
            dimension.$viewValue = null;
        }
    }

    //导出报表数据
    exportBiData() {
        let param = this.handlerService.buildDimParam(this.bi);
        if (!param) {
            return;
        }
        this.downloading = true;
        this.dataService.exportExcel(this.bi.id, this.bi.code, param, () => {
            this.downloading = false;
        });
    }


    ngOnDestroy(): void {
        this.router$.unsubscribe();
        this.timer && clearInterval(this.timer);
    }

}
