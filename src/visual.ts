"use strict";

import powerbi from "powerbi-visuals-api";
//@ts-ignore
import "../style/visual.less";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import DataViewMatrix = powerbi.DataViewMatrix;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

declare global {
    interface HTMLDivElement {
        selectionId?: ISelectionId;
    }
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private container: HTMLDivElement;
    private tooltipElement: HTMLDivElement;
    private host: IVisualHost;
    private selectionManager: ISelectionManager;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();

        this.target.style.position = "absolute";
        this.target.style.top = "0px";
        this.target.style.left = "0px";
        this.target.style.right = "0px";
        this.target.style.bottom = "0px";
        this.target.style.overflow = "hidden";

        this.container = document.createElement("div");
        this.container.className = "kanban-container";

        this.tooltipElement = document.createElement("div");
        this.tooltipElement.className = "kanban-tooltip";
        document.body.appendChild(this.tooltipElement);

        this.target.addEventListener("wheel", (event: WheelEvent) => {
            if (this.container) {
                this.container.scrollTop += event.deltaY;
            }
            event.preventDefault();
        }, { passive: false });

        this.container.addEventListener("click", (event: MouseEvent) => {
            const targetEl = event.target as HTMLElement;
            if (event.target === this.container || targetEl.tagName === "TABLE" || targetEl.tagName === "TD") {
                this.selectionManager.clear();
                this.applySelectionStyles();
            }
        });

        this.target.appendChild(this.container);
    }

    private getCardColorClass(status: string): string {
        if (!status) return "card-atraso-default";
        const st = status.toLowerCase();

        if (st.includes("atraso")) return "card-atraso-atraso";
        if (st.includes("hoje")) return "card-atraso-hoje";
        if (st.includes("próximos") || st.includes("proximos")) return "card-atraso-proximos";
        if (st.includes("futuro") || st.includes("futura")) return "card-atraso-futuro";

        return "card-atraso-default";
    }

    private applySelectionStyles() {
        const selectedIds = this.selectionManager.getSelectionIds();
        const cardsNodeList = this.container.querySelectorAll(".kanban-card");

        cardsNodeList.forEach((node: Node) => {
            const cardEl = node as HTMLDivElement;
            const cardSelectionId = cardEl.selectionId;

            if (selectedIds.length === 0) {
                cardEl.classList.remove("card-selected", "card-dimmed");
            } else {
                const isSelected = selectedIds.some(id => 
                    (id as any).getKey && cardSelectionId && (cardSelectionId as any).getKey 
                        ? (id as any).getKey() === (cardSelectionId as any).getKey() 
                        : id === cardSelectionId
                );

                if (isSelected) {
                    cardEl.classList.add("card-selected");
                    cardEl.classList.remove("card-dimmed");
                } else {
                    cardEl.classList.remove("card-selected");
                    cardEl.classList.add("card-dimmed");
                }
            }
        });
    }

    public update(options: VisualUpdateOptions) {
        this.container.innerHTML = "";

        if (options && options.viewport) {
            this.container.style.width = `${options.viewport.width}px`;
            this.container.style.height = `${options.viewport.height}px`;
        }

        const dataViews = options.dataViews;
        if (!dataViews || !dataViews[0] || !dataViews[0].matrix) {
            return;
        }

        const matrix: DataViewMatrix = dataViews[0].matrix;
        const rowHierarchy = matrix.rows.root.children || [];
        const colHierarchy = matrix.columns.root.children || [];

        const rowLevels = matrix.rows.levels || [];
        const colLevels = matrix.columns.levels || [];

        const columnsData: { [colIndex: number]: { cardText: string; selectionId: ISelectionId }[] } = {};
        let maxCardsInCol = 0;

        colHierarchy.forEach((col: DataViewMatrixNode, colIndex: number) => {
            columnsData[colIndex] = [];

            rowHierarchy.forEach((row: DataViewMatrixNode) => {
                const cellValue = row.values ? row.values[colIndex] : null;

                const selectionId = this.host.createSelectionIdBuilder()
                    .withMatrixNode(row, rowLevels)
                    .withMatrixNode(col, colLevels)
                    .createSelectionId();

                if (cellValue && cellValue.value !== null && cellValue.value !== undefined) {
                    const fullText = String(cellValue.value);
                    if (fullText.trim() !== "") {
                        const cardsArray = fullText.split(" | ");
                        cardsArray.forEach(card => {
                            if (card.trim() !== "") {
                                columnsData[colIndex].push({
                                    cardText: card,
                                    selectionId: selectionId
                                });
                            }
                        });
                    }
                }
            });

            if (columnsData[colIndex].length > maxCardsInCol) {
                maxCardsInCol = columnsData[colIndex].length;
            }
        });

        const table = document.createElement("table");
        table.className = "kanban-table";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        const emptyTh = document.createElement("th");
        emptyTh.className = "kanban-header-col col-fila";
        emptyTh.style.zIndex = "11";
        emptyTh.innerText = "Fila";
        headerRow.appendChild(emptyTh);

        colHierarchy.forEach(col => {
            const th = document.createElement("th");
            th.className = "kanban-header-col";
            const colVal = String(col.value ?? "");
            th.innerText = (colVal === "null" || colVal === "undefined" || colVal.trim() === "") ? "-" : colVal;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const totalRowsToDraw = rowHierarchy.length > 0 ? rowHierarchy.length : (maxCardsInCol > 0 ? maxCardsInCol : 1);

        for (let rowIndex = 0; rowIndex < totalRowsToDraw; rowIndex++) {
            const tr = document.createElement("tr");

            const thRow = document.createElement("th");
            thRow.className = "kanban-header-row";
            
            const rawRowValue = rowHierarchy[rowIndex] ? String(rowHierarchy[rowIndex].value) : String(rowIndex + 1);
            thRow.innerText = (rawRowValue === "null" || rawRowValue === "undefined" || rawRowValue.trim() === "") ? "-" : rawRowValue;
            
            tr.appendChild(thRow);

            colHierarchy.forEach((col, colIndex) => {
                const td = document.createElement("td");
                td.className = "kanban-cell";

                const cardItem = columnsData[colIndex][rowIndex];

                if (cardItem) {
                    const lines = cardItem.cardText.trim().split("\n");

                    const statusText = lines.length >= 4 ? lines[3] : "";
                    const colorClass = this.getCardColorClass(statusText);
                    const progressoText = lines.length >= 8 ? lines[7] : "0%";

                    const card = document.createElement("div");
                    card.className = `kanban-card ${colorClass}`;
                    card.selectionId = cardItem.selectionId;

                    card.addEventListener("click", (event: MouseEvent) => {
                        event.stopPropagation();
                        const multiSelect = event.ctrlKey || event.metaKey;
                        this.selectionManager.select(cardItem.selectionId, multiSelect).then(() => {
                            this.applySelectionStyles();
                        });
                    });

                    card.addEventListener("mousemove", (event: MouseEvent) => {
                        const cliente = lines.length >= 5 ? lines[4] : "-";
                        const produto = lines.length >= 6 ? lines[5] : "-";
                        const valor = lines.length >= 7 ? lines[6] : "-";

                        this.tooltipElement.innerHTML = `
                            <div class="tooltip-header">${lines[1] ?? 'Detalhes do Pedido'}</div>
                            <div class="tooltip-row"><span class="tooltip-label">Data Prod:</span> ${lines[0] ?? '-'}</div>
                            <div class="tooltip-row"><span class="tooltip-label">Estruturado:</span> ${lines[2] ?? '-'}</div>
                            <div class="tooltip-row"><span class="tooltip-label">Cliente:</span> ${cliente}</div>
                            <div class="tooltip-row"><span class="tooltip-label">Produto:</span> ${produto}</div>
                            <div class="tooltip-row"><span class="tooltip-label">Valor Prod:</span> ${valor}</div>
                            <div class="tooltip-row"><span class="tooltip-label">Progresso:</span> ${progressoText}</div>
                            <div class="tooltip-row"><span class="tooltip-label">Status:</span> ${statusText}</div>
                        `;

                        this.tooltipElement.style.display = "block";

                        const tooltipWidth = this.tooltipElement.offsetWidth || 220;
                        const tooltipHeight = this.tooltipElement.offsetHeight || 180;

                        const windowWidth = window.innerWidth;
                        const windowHeight = window.innerHeight;

                        let leftPos = event.clientX + 15;
                        let topPos = event.clientY + 15;

                        if (leftPos + tooltipWidth > windowWidth - 10) {
                            leftPos = event.clientX - tooltipWidth - 15;
                        }

                        if (topPos + tooltipHeight > windowHeight - 10) {
                            topPos = event.clientY - tooltipHeight - 15;
                        }

                        this.tooltipElement.style.left = `${Math.max(10, leftPos)}px`;
                        this.tooltipElement.style.top = `${Math.max(10, topPos)}px`;
                    });

                    card.addEventListener("mouseleave", () => {
                        this.tooltipElement.style.display = "none";
                    });

                    if (lines.length >= 1) {
                        const dateEl = document.createElement("div");
                        dateEl.className = "card-date";
                        dateEl.innerText = lines[0];
                        card.appendChild(dateEl);
                    }

                    if (lines.length >= 2) {
                        const pedEl = document.createElement("div");
                        pedEl.className = "card-ped";
                        pedEl.innerText = lines[1];
                        card.appendChild(pedEl);
                    }

                    if (lines.length >= 3) {
                        const codeEl = document.createElement("div");
                        codeEl.className = "card-code";
                        codeEl.innerText = lines[2];
                        card.appendChild(codeEl);
                    }

                    const progressWrapper = document.createElement("div");
                    progressWrapper.className = "progress-wrapper";

                    const progressContainer = document.createElement("div");
                    progressContainer.className = "progress-container";

                    const progressBar = document.createElement("div");
                    progressBar.className = "progress-bar";
                    
                    const numericMatch = progressoText.match(/\d+/);
                    const numericValue = numericMatch ? parseInt(numericMatch[0], 10) : 0;
                    progressBar.style.width = `${Math.min(100, Math.max(0, numericValue))}%`;

                    if (numericValue >= 100) {
                        progressBar.style.backgroundColor = "#D33A77";
                    }

                    progressContainer.appendChild(progressBar);

                    const progressTextEl = document.createElement("span");
                    progressTextEl.className = "progress-text";
                    progressTextEl.innerText = progressoText;

                    progressWrapper.appendChild(progressContainer);
                    progressWrapper.appendChild(progressTextEl);

                    card.appendChild(progressWrapper);

                    td.appendChild(card);
                }

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        this.container.appendChild(table);

        this.applySelectionStyles();
    }
}