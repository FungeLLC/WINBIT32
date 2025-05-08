import React from 'react';
import _ from 'lodash';

const Toolbar = ({ subPrograms, onSubProgramClick, programData }) => {

	if (!subPrograms) {
		return null;
	}

	return (
		<div className="toolbar">
			{subPrograms
				.filter(program => program.hideInToolbar !== true)
				.map((program, index) => (
				<button
					key={index}
					 onClick={
						() => {
							// console.log('Toolbar click', program, programData);
							// const clonedProgram = _.cloneDeep(program);
							// clonedProgram.programData = programData;
							onSubProgramClick(program, programData);
						}
					}
					title={program.title}
				>
						<div>{program.icon}</div><div className='toolbar-icon-title'>{program.title}</div> 
				</button>
			))}
		</div>
	);
};

export default Toolbar;